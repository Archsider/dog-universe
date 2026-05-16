/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.TIME_PROPOSAL_TOKEN_SECRET = 'a'.repeat(32);

const authMock = vi.fn();
vi.mock('../../../../../../../../auth', () => ({ auth: () => authMock() }));

// State shared across mocked Prisma calls.
type Booking = Record<string, any>;
type TP = Record<string, any>;
const state: { bookings: Booking[]; proposals: TP[] } = { bookings: [], proposals: [] };

vi.mock('@/lib/prisma', () => ({
  prisma: {
    booking: {
      findFirst: async ({ where }: any) => state.bookings.find((b) => b.id === where.id && b.deletedAt === null) ?? null,
      findUnique: async ({ where }: any) => state.bookings.find((b) => b.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const b = state.bookings.find((x) => x.id === where.id);
        if (!b) throw new Error('not found');
        // Optimistic lock — version match.
        if (where.version != null && b.version !== where.version) throw new Error('version conflict');
        Object.assign(b, { ...data, version: typeof data.version === 'object' ? b.version + 1 : data.version ?? b.version });
        return { id: b.id };
      },
    },
    timeProposal: {
      findFirst: async ({ where, orderBy }: any) => {
        let rows = state.proposals.filter((p) =>
          (where.bookingId == null || p.bookingId === where.bookingId) &&
          (where.scope == null || p.scope === where.scope) &&
          (where.status == null || p.status === where.status),
        );
        if (orderBy?.respondedAt) rows = rows.sort((a, b) => (b.respondedAt ?? 0) - (a.respondedAt ?? 0));
        if (orderBy?.proposedAt) rows = rows.sort((a, b) => (b.proposedAt ?? 0) - (a.proposedAt ?? 0));
        return rows[0] ?? null;
      },
      findUnique: async ({ where }: any) => state.proposals.find((p) => p.id === where.id) ?? null,
      findMany: async ({ where }: any) =>
        state.proposals.filter((p) =>
          (where.bookingId == null || p.bookingId === where.bookingId) &&
          (where.status == null
            ? true
            : where.status.in ? where.status.in.includes(p.status) : p.status === where.status),
        ),
      create: async ({ data }: any) => {
        const row = { ...data, createdAt: new Date(), updatedAt: new Date() };
        state.proposals.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const p = state.proposals.find((x) => x.id === where.id);
        if (!p) throw new Error('not found');
        Object.assign(p, data);
        return p;
      },
      updateMany: async ({ where, data }: any) => {
        let n = 0;
        for (const p of state.proposals) {
          if (
            p.bookingId === where.bookingId &&
            (where.scope == null || p.scope === where.scope) &&
            (where.status == null || p.status === where.status)
          ) {
            Object.assign(p, data);
            n++;
          }
        }
        return { count: n };
      },
    },
  },
}));

// withSpan : pass-through
vi.mock('@/lib/observability', () => ({
  withSpan: async (_n: string, _a: any, fn: () => any) => fn(),
}));

// logAction : noop
vi.mock('@/lib/log', () => ({
  logAction: vi.fn(async () => undefined),
  LOG_ACTIONS: {
    BOOKING_CANCELLED: 'BOOKING_CANCELLED',
    BOOKING_TIME_PROPOSED: 'BOOKING_TIME_PROPOSED',
    BOOKING_TIME_CONFIRMED: 'BOOKING_TIME_CONFIRMED',
    BOOKING_TIME_REJECTED: 'BOOKING_TIME_REJECTED',
  },
}));

// Notifications : noop stubs
vi.mock('@/lib/notifications', () => ({
  createBookingCancelledNotification: vi.fn(async () => undefined),
  createTimeProposedNotification: vi.fn(async () => undefined),
  createTimeConfirmedNotification: vi.fn(async () => undefined),
}));

beforeEach(() => {
  state.bookings = [
    { id: 'b1', clientId: 'c1', status: 'CONFIRMED', version: 1, deletedAt: null, client: { role: 'CLIENT' } },
  ];
  state.proposals = [];
  authMock.mockReset();
  authMock.mockReturnValue({ user: { id: 'admin1', role: 'ADMIN' } });
});

async function callTimeProposals(body: any) {
  const req = new Request('http://test/', { method: 'POST', body: JSON.stringify(body) });
  const mod = await import('../route');
  const res = await mod.POST(req as any, { params: Promise.resolve({ id: 'b1' }) });
  return { status: res.status, body: await res.json() };
}

describe('POST /api/admin/bookings/[id]/time-proposals — propose', () => {
  it('rejects non-admin session', async () => {
    authMock.mockReturnValueOnce({ user: { id: 'u', role: 'CLIENT' } });
    const r = await callTimeProposals({ action: 'propose', scope: 'ARRIVAL', time: '10:00' });
    expect(r.status).toBe(403);
  });

  it('rejects malformed body (wrong time format)', async () => {
    const r = await callTimeProposals({ action: 'propose', scope: 'ARRIVAL', time: '10' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('INVALID_BODY');
  });

  it('happy path : creates a PENDING proposal with a publicToken', async () => {
    const r = await callTimeProposals({ action: 'propose', scope: 'ARRIVAL', time: '11:00', note: 'équipe restreinte' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.proposalId).toBeTruthy();
    expect(r.body.publicToken).toBeTruthy();
    expect(state.proposals).toHaveLength(1);
    expect(state.proposals[0].status).toBe('PENDING');
    expect(state.proposals[0].proposedByRole).toBe('ADMIN');
    expect(state.proposals[0].proposalNote).toBe('équipe restreinte');
  });

  it('proposing again supersedes the previous PENDING', async () => {
    await callTimeProposals({ action: 'propose', scope: 'ARRIVAL', time: '10:00' });
    expect(state.proposals.filter((p) => p.status === 'PENDING')).toHaveLength(1);
    await callTimeProposals({ action: 'propose', scope: 'ARRIVAL', time: '11:00' });
    expect(state.proposals.filter((p) => p.status === 'PENDING')).toHaveLength(1);
    expect(state.proposals.filter((p) => p.status === 'SUPERSEDED')).toHaveLength(1);
  });
});

describe('POST /api/admin/bookings/[id]/time-proposals — accept', () => {
  it('admin accepts client PENDING proposal → ACCEPTED', async () => {
    state.proposals.push({
      id: 'tp1', bookingId: 'b1', scope: 'ARRIVAL', time: '10:00', status: 'PENDING',
      proposedBy: 'c1', proposedByRole: 'CLIENT',
    });
    const r = await callTimeProposals({ action: 'accept', proposalId: 'tp1' });
    expect(r.status).toBe(200);
    expect(state.proposals[0].status).toBe('ACCEPTED');
    expect(state.proposals[0].respondedBy).toBe('admin1');
  });

  it('returns 404 if the proposalId belongs to another booking', async () => {
    state.proposals.push({
      id: 'tp1', bookingId: 'OTHER', scope: 'ARRIVAL', time: '10:00', status: 'PENDING',
    });
    const r = await callTimeProposals({ action: 'accept', proposalId: 'tp1' });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('PROPOSAL_NOT_FOUND');
  });
});

describe('POST /api/admin/bookings/[id]/time-proposals — reject', () => {
  it('rejects with a required note ≥ 10 chars', async () => {
    state.proposals.push({
      id: 'tp1', bookingId: 'b1', scope: 'ARRIVAL', time: '10:00', status: 'PENDING',
    });
    const r = await callTimeProposals({ action: 'reject', proposalId: 'tp1', note: 'too early sorry' });
    expect(r.status).toBe(200);
    expect(state.proposals[0].status).toBe('REJECTED');
    expect(state.proposals[0].responseNote).toBe('too early sorry');
  });

  it('rejects a too-short note', async () => {
    const r = await callTimeProposals({ action: 'reject', proposalId: 'tp1', note: 'short' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('INVALID_BODY');
  });
});

describe('cross-role gate', () => {
  it('ADMIN cannot touch a SUPERADMIN-owned booking', async () => {
    state.bookings[0].client = { role: 'SUPERADMIN' };
    const r = await callTimeProposals({ action: 'propose', scope: 'ARRIVAL', time: '10:00' });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('CROSS_ROLE_FORBIDDEN');
  });
});
