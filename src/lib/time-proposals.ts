// Service layer for TimeProposal — the booking lifecycle time-confirmation
// entity. All mutations go through this module ; routes / UI never touch
// `prisma.timeProposal.update` directly to keep the state machine
// invariants in one place.
//
// State machine (status transitions) :
//
//     PENDING ──accept──> ACCEPTED   (terminal-positive)
//        │
//        ├──reject──> REJECTED       (terminal-negative)
//        │
//        ├──cancel──> CANCELLED      (proposer withdrew, terminal)
//        │
//        └──supersede──> SUPERSEDED  (replaced by a newer proposal)
//
// Any PENDING proposal becomes SUPERSEDED automatically when a new one is
// created for the same (bookingId, scope). Only one PENDING is ever live
// per pair.
//
// Source : audit produit 2026-05-17 + architecture proposal (Calendly /
// Stripe Quotes pattern).

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { prisma } from './prisma';
import { notDeleted } from './prisma-soft';
import type { Prisma, TimeProposalScope, TimeProposalStatus } from '@prisma/client';

// ─── Constants ──────────────────────────────────────────────────────────

const TOKEN_NONCE_BYTES = 16;
const TOKEN_TTL_DAYS = 14;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ─── Token helpers ──────────────────────────────────────────────────────

function getSecret(): string {
  // We re-use NEXTAUTH_SECRET as the signing key — it's already required
  // at boot (assertProductionEnv) and rotating it invalidates outstanding
  // links, which is the desired behaviour after a credential leak.
  const s = process.env.TIME_PROPOSAL_TOKEN_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error('TIME_PROPOSAL_TOKEN_SECRET (or NEXTAUTH_SECRET) must be set');
  }
  return s;
}

/** Builds a self-verifying token `<proposalId>.<nonce16hex>.<sig64hex>`. */
function signToken(proposalId: string): string {
  const nonce = randomBytes(TOKEN_NONCE_BYTES).toString('hex');
  const payload = `${proposalId}.${nonce}`;
  const sig = createHmac('sha256', getSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/** Verifies a token. Returns `proposalId` or null. Constant-time HMAC check. */
export function verifyTimeProposalToken(token: string): string | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [proposalId, nonce, sig] = parts;
  if (!proposalId || !nonce || !sig) return null;
  const expected = createHmac('sha256', getSecret()).update(`${proposalId}.${nonce}`).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return null;
  try {
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return proposalId;
}

// ─── Validation ─────────────────────────────────────────────────────────

export function isValidTime(time: string): boolean {
  return typeof time === 'string' && TIME_PATTERN.test(time);
}

// ─── Read helpers ───────────────────────────────────────────────────────

export type Scope = TimeProposalScope;

interface PrismaLike {
  timeProposal: {
    findFirst: typeof prisma.timeProposal.findFirst;
    findUnique: typeof prisma.timeProposal.findUnique;
    findMany: typeof prisma.timeProposal.findMany;
    create: typeof prisma.timeProposal.create;
    update: typeof prisma.timeProposal.update;
    updateMany: typeof prisma.timeProposal.updateMany;
  };
}

/** Latest ACCEPTED time for a (booking, scope) — null if never confirmed. */
export async function getConfirmedTime(
  bookingId: string,
  scope: Scope,
  client: PrismaLike = prisma,
): Promise<string | null> {
  const row = await client.timeProposal.findFirst({
    where: { bookingId, scope, status: 'ACCEPTED' },
    orderBy: { respondedAt: 'desc' },
    select: { time: true },
  });
  return row?.time ?? null;
}

/** Currently-open proposal (PENDING) for a (booking, scope) — null if none. */
export async function getCurrentProposal(
  bookingId: string,
  scope: Scope,
  client: PrismaLike = prisma,
) {
  return client.timeProposal.findFirst({
    where: { bookingId, scope, status: 'PENDING' },
    orderBy: { proposedAt: 'desc' },
  });
}

// ─── State machine mutations ────────────────────────────────────────────

export type CreateProposalInput = {
  bookingId: string;
  scope: Scope;
  time: string;
  proposedBy: string;
  proposedByRole: 'CLIENT' | 'ADMIN' | 'SUPERADMIN';
  proposalNote?: string | null;
  /** When the proposer is ADMIN/SUPERADMIN, the receiver is the client → we
   *  emit a public-token link they can click in an email. When the proposer
   *  is the CLIENT, the admin doesn't need a public link (they have a
   *  session) — token is omitted. */
  emitPublicToken?: boolean;
};

export type CreateProposalResult =
  | {
      ok: true;
      proposalId: string;
      publicToken: string | null;
      publicTokenExpiresAt: Date | null;
    }
  | { ok: false; error: 'INVALID_TIME' | 'BOOKING_NOT_FOUND' | 'BOOKING_NOT_OPEN' | 'RACE_FAILED' };

/**
 * Creates a new PENDING proposal and supersedes any older PENDING for the
 * same (bookingId, scope). Pure DB side-effects ; the caller handles
 * notification + email + audit log.
 */
export async function createProposal(
  input: CreateProposalInput,
  client: PrismaLike = prisma,
): Promise<CreateProposalResult> {
  if (!isValidTime(input.time)) return { ok: false, error: 'INVALID_TIME' };

  // Guard : booking must be in a state where time negotiation makes sense.
  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id: input.bookingId }),
    select: { status: true },
  });
  if (!booking) return { ok: false, error: 'BOOKING_NOT_FOUND' };
  if (
    booking.status === 'COMPLETED' ||
    booking.status === 'CANCELLED' ||
    booking.status === 'REJECTED' ||
    booking.status === 'NO_SHOW'
  ) {
    return { ok: false, error: 'BOOKING_NOT_OPEN' };
  }

  // Supersede any older PENDING for the same (bookingId, scope), then
  // create the new PENDING.  Two statements are NOT atomic on their own,
  // so concurrent calls can both pass the sweep and both create a PENDING
  // — without the DB-side partial UNIQUE index it's a real race.
  //
  // The partial index `TimeProposal_one_pending_per_scope_idx` (migration
  // 20260520_time_proposal_partial_unique) makes the create throw P2002
  // when another concurrent path won.  One retry resolves : re-sweep the
  // PENDING (the racer's row is now visible) and re-create.  Second P2002
  // means the race is sustained → caller gets a clean error.
  const emitToken = input.emitPublicToken !== false && input.proposedByRole !== 'CLIENT';
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 86_400_000);

  async function sweepAndCreate() {
    await client.timeProposal.updateMany({
      where: { bookingId: input.bookingId, scope: input.scope, status: 'PENDING' },
      data: { status: 'SUPERSEDED' },
    });
    const proposalId = `tp_${randomBytes(12).toString('hex')}`;
    const publicToken = emitToken ? signToken(proposalId) : null;
    return client.timeProposal.create({
      data: {
        id: proposalId,
        bookingId: input.bookingId,
        scope: input.scope,
        time: input.time,
        status: 'PENDING',
        proposedBy: input.proposedBy,
        proposedByRole: input.proposedByRole,
        proposalNote: input.proposalNote ?? null,
        publicToken,
        publicTokenExpiresAt: publicToken ? expiresAt : null,
      },
      select: { id: true, publicToken: true, publicTokenExpiresAt: true },
    });
  }

  let created;
  try {
    created = await sweepAndCreate();
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any)?.code === 'P2002') {
      // Race lost — sweep again and retry once.  Second collision is
      // bubbled up as RACE_FAILED so the caller can surface it.
      try {
        created = await sweepAndCreate();
      } catch (retryErr) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((retryErr as any)?.code === 'P2002') {
          return { ok: false, error: 'RACE_FAILED' };
        }
        throw retryErr;
      }
    } else {
      throw err;
    }
  }

  return {
    ok: true,
    proposalId: created.id,
    publicToken: created.publicToken,
    publicTokenExpiresAt: created.publicTokenExpiresAt,
  };
}

export type RespondInput = {
  proposalId: string;
  respondedBy: string;
  respondedByRole: 'CLIENT' | 'ADMIN' | 'SUPERADMIN';
  responseNote?: string | null;
};

export type RespondResult =
  | { ok: true; status: TimeProposalStatus }
  | { ok: false; error: 'PROPOSAL_NOT_FOUND' | 'PROPOSAL_NOT_PENDING' };

/** Accepts a proposal — terminal-positive transition. */
export async function acceptProposal(
  input: RespondInput,
  client: PrismaLike = prisma,
): Promise<RespondResult> {
  const found = await client.timeProposal.findUnique({
    where: { id: input.proposalId },
    select: { id: true, status: true },
  });
  if (!found) return { ok: false, error: 'PROPOSAL_NOT_FOUND' };
  if (found.status !== 'PENDING') return { ok: false, error: 'PROPOSAL_NOT_PENDING' };

  await client.timeProposal.update({
    where: { id: input.proposalId },
    data: {
      status: 'ACCEPTED',
      respondedBy: input.respondedBy,
      respondedByRole: input.respondedByRole,
      respondedAt: new Date(),
      responseNote: input.responseNote ?? null,
      // Clear the public token — link returns 410 Gone after acceptance.
      publicToken: null,
      publicTokenExpiresAt: null,
    },
  });
  return { ok: true, status: 'ACCEPTED' };
}

/** Rejects a proposal — terminal-negative ; admin must propose a new time. */
export async function rejectProposal(
  input: RespondInput,
  client: PrismaLike = prisma,
): Promise<RespondResult> {
  const found = await client.timeProposal.findUnique({
    where: { id: input.proposalId },
    select: { id: true, status: true },
  });
  if (!found) return { ok: false, error: 'PROPOSAL_NOT_FOUND' };
  if (found.status !== 'PENDING') return { ok: false, error: 'PROPOSAL_NOT_PENDING' };

  await client.timeProposal.update({
    where: { id: input.proposalId },
    data: {
      status: 'REJECTED',
      respondedBy: input.respondedBy,
      respondedByRole: input.respondedByRole,
      respondedAt: new Date(),
      responseNote: input.responseNote ?? null,
      publicToken: null,
      publicTokenExpiresAt: null,
    },
  });
  return { ok: true, status: 'REJECTED' };
}

/**
 * Cascade : marks all PENDING proposals for a booking as SUPERSEDED.
 * Called when the booking is CANCELLED / REJECTED / NO_SHOW — the time
 * negotiation is moot. Idempotent.
 */
export async function supersedePendingForBooking(
  bookingId: string,
  client: PrismaLike = prisma,
): Promise<number> {
  // Sweep BOTH PENDING and ACCEPTED proposals — the booking is going
  // terminal (CANCELLED/REJECTED) so no time negotiation makes sense
  // anymore, and `getConfirmedTime()` was still returning an ACCEPTED
  // proposal's time post-cancel until 2026-05-19.  Audit clarity wins
  // over historical preservation here ; the SUPERSEDED status itself
  // carries the "no longer active" signal in the trail.
  const r = await client.timeProposal.updateMany({
    where: { bookingId, status: { in: ['PENDING', 'ACCEPTED'] } },
    data: { status: 'SUPERSEDED', publicToken: null, publicTokenExpiresAt: null },
  });
  return r.count;
}

// ─── Exported for tests ─────────────────────────────────────────────────

export const __test = { signToken, TIME_PATTERN, TOKEN_TTL_DAYS };
