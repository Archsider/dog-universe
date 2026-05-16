/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac, randomBytes } from 'crypto';

process.env.TIME_PROPOSAL_TOKEN_SECRET = 'a'.repeat(32);

type TP = Record<string, any>;
const state: { proposals: TP[] } = { proposals: [] };

vi.mock('@/lib/prisma', () => ({
  prisma: {
    timeProposal: {
      findUnique: async ({ where }: any) => state.proposals.find((p) => p.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const p = state.proposals.find((x) => x.id === where.id);
        if (!p) throw new Error('not found');
        Object.assign(p, data);
        return p;
      },
    },
    booking: {
      findUnique: async () => ({ clientId: 'c1' }),
    },
  },
}));
vi.mock('@/lib/log', () => ({
  logAction: vi.fn(async () => undefined),
  LOG_ACTIONS: {
    BOOKING_TIME_CONFIRMED: 'BOOKING_TIME_CONFIRMED',
    BOOKING_TIME_REJECTED: 'BOOKING_TIME_REJECTED',
  },
}));
vi.mock('@/lib/notifications/booking-admin-notif', () => ({
  notifyAdminsBookingTimeAccepted: vi.fn(async () => undefined),
  notifyAdminsBookingTimeRejected: vi.fn(async () => undefined),
}));
vi.mock('@/lib/notifications', () => ({
  createAdminMessageNotification: vi.fn(async () => undefined),
}));

function makeToken(proposalId: string, secret = process.env.TIME_PROPOSAL_TOKEN_SECRET!): string {
  const nonce = randomBytes(16).toString('hex');
  const payload = `${proposalId}.${nonce}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

beforeEach(() => {
  state.proposals = [
    {
      id: 'tp1', bookingId: 'b1', scope: 'ARRIVAL', time: '10:00', status: 'PENDING',
      publicTokenExpiresAt: new Date(Date.now() + 86_400_000),
    },
  ];
});

async function callAccept(token: string) {
  const req = new Request('http://test/', { method: 'POST' });
  const mod = await import('../accept/route');
  const res = await mod.POST(req as any, { params: Promise.resolve({ token }) });
  return { status: res.status, body: await res.json() };
}

async function callReject(token: string, body: any) {
  const req = new Request('http://test/', { method: 'POST', body: JSON.stringify(body) });
  const mod = await import('../reject/route');
  const res = await mod.POST(req as any, { params: Promise.resolve({ token }) });
  return { status: res.status, body: await res.json() };
}

describe('POST /api/time-proposals/[token]/accept', () => {
  it('happy path : flips PENDING → ACCEPTED', async () => {
    const r = await callAccept(makeToken('tp1'));
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(state.proposals[0].status).toBe('ACCEPTED');
  });

  it('rejects an invalid token (wrong signature)', async () => {
    const tampered = makeToken('tp1').replace(/.$/, 'X');
    const r = await callAccept(tampered);
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('INVALID_TOKEN');
  });

  it('rejects a token signed with a different secret', async () => {
    const r = await callAccept(makeToken('tp1', 'b'.repeat(32)));
    expect(r.status).toBe(401);
  });

  it('returns 410 when the proposal is already ACCEPTED', async () => {
    state.proposals[0].status = 'ACCEPTED';
    const r = await callAccept(makeToken('tp1'));
    expect(r.status).toBe(410);
    expect(r.body.error).toBe('ALREADY_RESOLVED');
  });

  it('returns 410 when the token has expired', async () => {
    state.proposals[0].publicTokenExpiresAt = new Date(Date.now() - 86_400_000);
    const r = await callAccept(makeToken('tp1'));
    expect(r.status).toBe(410);
    expect(r.body.error).toBe('TOKEN_EXPIRED');
  });
});

describe('POST /api/time-proposals/[token]/reject', () => {
  it('happy path : flips PENDING → REJECTED with the reason', async () => {
    const r = await callReject(makeToken('tp1'), { note: 'cannot make 10am sorry' });
    expect(r.status).toBe(200);
    expect(state.proposals[0].status).toBe('REJECTED');
    expect(state.proposals[0].responseNote).toBe('cannot make 10am sorry');
  });

  it('rejects a too-short reason', async () => {
    const r = await callReject(makeToken('tp1'), { note: 'no' });
    expect(r.status).toBe(400);
  });

  it('returns 410 if already resolved', async () => {
    state.proposals[0].status = 'REJECTED';
    const r = await callReject(makeToken('tp1'), { note: 'try again with a long enough message' });
    expect(r.status).toBe(410);
  });
});
