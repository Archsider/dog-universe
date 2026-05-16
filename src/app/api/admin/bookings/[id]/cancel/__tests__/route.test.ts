/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
vi.mock('../../../../../../../../auth', () => ({ auth: () => authMock() }));

type Booking = Record<string, any>;
type TP = Record<string, any>;
const state: { bookings: Booking[]; proposals: TP[] } = { bookings: [], proposals: [] };

vi.mock('@/lib/prisma', () => ({
  prisma: {
    booking: {
      findFirst: async ({ where }: any) => state.bookings.find((b) => b.id === where.id && b.deletedAt === null) ?? null,
      update: async ({ where, data }: any) => {
        const b = state.bookings.find((x) => x.id === where.id);
        if (!b) throw new Error('not found');
        if (where.version != null && b.version !== where.version) throw new Error('version conflict');
        Object.assign(b, data, { version: b.version + 1 });
        return { id: b.id };
      },
    },
    timeProposal: {
      updateMany: async ({ where, data }: any) => {
        let n = 0;
        for (const p of state.proposals) {
          if (p.bookingId === where.bookingId && (where.status == null || p.status === where.status)) {
            Object.assign(p, data);
            n++;
          }
        }
        return { count: n };
      },
    },
  },
}));

vi.mock('@/lib/observability', () => ({
  withSpan: async (_n: string, _a: any, fn: () => any) => fn(),
}));
vi.mock('@/lib/log', () => ({
  logAction: vi.fn(async () => undefined),
  LOG_ACTIONS: { BOOKING_CANCELLED: 'BOOKING_CANCELLED' },
}));
const notifMock = vi.fn(async () => undefined);
vi.mock('@/lib/notifications', () => ({
  createBookingCancelledNotification: (...a: any[]) => notifMock(...a),
}));

beforeEach(() => {
  state.bookings = [
    { id: 'b1', clientId: 'c1', status: 'CONFIRMED', version: 1, deletedAt: null, client: { role: 'CLIENT' } },
  ];
  state.proposals = [
    { id: 'tp1', bookingId: 'b1', scope: 'ARRIVAL', status: 'PENDING' },
    { id: 'tp2', bookingId: 'b1', scope: 'TAXI_GO', status: 'PENDING' },
    { id: 'tp3', bookingId: 'b1', scope: 'ARRIVAL', status: 'ACCEPTED' },
  ];
  authMock.mockReset();
  authMock.mockReturnValue({ user: { id: 'admin1', role: 'ADMIN' } });
  notifMock.mockReset();
  notifMock.mockResolvedValue(undefined);
});

async function call(body: any) {
  const req = new Request('http://test/', { method: 'POST', body: JSON.stringify(body) });
  const mod = await import('../route');
  const res = await mod.POST(req as any, { params: Promise.resolve({ id: 'b1' }) });
  return { status: res.status, body: await res.json() };
}

describe('POST /api/admin/bookings/[id]/cancel — WIN 1 root cause fix', () => {
  it('happy path : cancels + cascades 2 PENDING proposals + notifies', async () => {
    const r = await call({ reason: 'client called to cancel' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.timeProposalsSuperseded).toBe(2);
    expect(state.bookings[0].status).toBe('CANCELLED');
    expect(state.bookings[0].cancellationReason).toBe('client called to cancel');
    // 2 PENDING → SUPERSEDED ; the ACCEPTED stays untouched.
    expect(state.proposals.filter((p) => p.status === 'SUPERSEDED')).toHaveLength(2);
    expect(state.proposals.find((p) => p.id === 'tp3')!.status).toBe('ACCEPTED');
    expect(notifMock).toHaveBeenCalledOnce();
  });

  it('rejects too-short reason', async () => {
    const r = await call({ reason: 'oops' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('INVALID_BODY');
    expect(state.bookings[0].status).toBe('CONFIRMED');
  });

  it('silent=true skips client notification', async () => {
    const r = await call({ reason: 'duplicate booking cleanup', silent: true });
    expect(r.status).toBe(200);
    expect(notifMock).not.toHaveBeenCalled();
  });

  it('refuses terminal statuses (already CANCELLED)', async () => {
    state.bookings[0].status = 'CANCELLED';
    const r = await call({ reason: 'already cancelled retry' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('INVALID_STATUS_TRANSITION');
    expect(r.body.from).toBe('CANCELLED');
  });

  it('refuses non-admin', async () => {
    authMock.mockReturnValueOnce({ user: { id: 'c', role: 'CLIENT' } });
    const r = await call({ reason: 'client trying to self-cancel' });
    expect(r.status).toBe(403);
  });

  it('ADMIN cannot cancel a SUPERADMIN-owned booking (cross-role)', async () => {
    state.bookings[0].client = { role: 'SUPERADMIN' };
    const r = await call({ reason: 'forbidden attempt' });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('CROSS_ROLE_FORBIDDEN');
  });
});
