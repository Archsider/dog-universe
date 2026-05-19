/**
 * Regression tests for PATCH /api/admin/taxi-trips/[id]/status — specifically
 * the `force: true` retroactive-correction path (PR claude/taxi-quick-complete-retroactive).
 *
 * Force path contract:
 *   - Only ADMIN/SUPERADMIN can call it (inherited from requireRole)
 *   - nextStatus MUST be the trip's canonical terminal (ARRIVED_AT_PENSION /
 *     ARRIVED_AT_CLIENT) — admin cannot use force to jump to an intermediate step
 *   - Skips notifyTaxiTransition when silent: true
 *   - Idempotent if already terminal
 *   - Writes ActionLog TAXI_STATUS_FORCED entry
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  taxiTripFindUnique: vi.fn(),
  txExecute: vi.fn(),
  bookingUpdate: vi.fn(),
  clearLocation: vi.fn(async () => undefined),
  notifyTaxiTransition: vi.fn(async () => undefined),
  logAction: vi.fn(async () => undefined),
}));

vi.mock('@/lib/auth-guards', () => ({ requireRole: mocks.requireRole }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    taxiTrip: { findUnique: mocks.taxiTripFindUnique, update: vi.fn() },
    taxiStatusHistory: { create: vi.fn() },
    booking: { update: mocks.bookingUpdate },
    $transaction: (ops: unknown[]) => mocks.txExecute(ops),
  },
}));
vi.mock('@/lib/taxi-location', () => ({ clearLocation: mocks.clearLocation }));
vi.mock('@/lib/taxi-notifications', () => ({ notifyTaxiTransition: mocks.notifyTaxiTransition }));
vi.mock('@/lib/log', () => ({
  logAction: mocks.logAction,
  LOG_ACTIONS: { TAXI_STATUS_FORCED: 'TAXI_STATUS_FORCED' },
}));

import { PATCH } from '../route';

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/admin/taxi-trips/trip1/status', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: 'trip1' }) };

const baseTrip = {
  id: 'trip1',
  bookingId: 'bk1',
  tripType: 'OUTBOUND',
  status: 'PLANNED',
  booking: {
    client: { name: 'Test', phone: '+212600000000' },
    bookingPets: [],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue({ session: { user: { id: 'admin1', role: 'ADMIN' } } });
  mocks.taxiTripFindUnique.mockResolvedValue(baseTrip);
  mocks.txExecute.mockResolvedValue([]);
});

describe('PATCH /api/admin/taxi-trips/[id]/status — force path', () => {
  it('rejects force with nextStatus other than the trip type\'s terminal', async () => {
    const res = await PATCH(
      makeReq({ nextStatus: 'ON_SITE_CLIENT', force: true }) as any,
      ctx as any,
    );
    expect(res.status).toBe(400);
    expect(mocks.txExecute).not.toHaveBeenCalled();
  });

  it('OUTBOUND: accepts force → ARRIVED_AT_PENSION', async () => {
    const res = await PATCH(
      makeReq({ nextStatus: 'ARRIVED_AT_PENSION', force: true }) as any,
      ctx as any,
    );
    expect(res.status).toBe(200);
    expect(mocks.txExecute).toHaveBeenCalledTimes(1);
  });

  it('RETURN: accepts force → ARRIVED_AT_CLIENT', async () => {
    mocks.taxiTripFindUnique.mockResolvedValueOnce({ ...baseTrip, tripType: 'RETURN' });
    const res = await PATCH(
      makeReq({ nextStatus: 'ARRIVED_AT_CLIENT', force: true }) as any,
      ctx as any,
    );
    expect(res.status).toBe(200);
  });

  it('STANDALONE: accepts force → ARRIVED_AT_PENSION + flips Booking to COMPLETED', async () => {
    mocks.taxiTripFindUnique.mockResolvedValueOnce({ ...baseTrip, tripType: 'STANDALONE' });
    const res = await PATCH(
      makeReq({ nextStatus: 'ARRIVED_AT_PENSION', force: true }) as any,
      ctx as any,
    );
    expect(res.status).toBe(200);
    expect(mocks.bookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bk1' },
        data: { status: 'COMPLETED' },
      }),
    );
  });

  it('skips notifyTaxiTransition when silent=true', async () => {
    await PATCH(
      makeReq({ nextStatus: 'ARRIVED_AT_PENSION', force: true, silent: true }) as any,
      ctx as any,
    );
    expect(mocks.notifyTaxiTransition).not.toHaveBeenCalled();
  });

  it('writes ActionLog TAXI_STATUS_FORCED with previous + new status', async () => {
    await PATCH(
      makeReq({ nextStatus: 'ARRIVED_AT_PENSION', force: true, silent: true }) as any,
      ctx as any,
    );
    expect(mocks.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TAXI_STATUS_FORCED',
        entityType: 'TaxiTrip',
        entityId: 'trip1',
        details: expect.objectContaining({
          previousStatus: 'PLANNED',
          newStatus: 'ARRIVED_AT_PENSION',
          silent: true,
          tripType: 'OUTBOUND',
        }),
      }),
    );
  });

  it('idempotent: returns alreadyTerminal=true if trip already at terminal', async () => {
    mocks.taxiTripFindUnique.mockResolvedValueOnce({
      ...baseTrip,
      status: 'ARRIVED_AT_PENSION',
    });
    const res = await PATCH(
      makeReq({ nextStatus: 'ARRIVED_AT_PENSION', force: true }) as any,
      ctx as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alreadyTerminal).toBe(true);
    expect(mocks.txExecute).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/taxi-trips/[id]/status — standard path (regression)', () => {
  it('still rejects non-sequential transitions when force is not set', async () => {
    // Trip is PLANNED, attempt to jump to ON_SITE_CLIENT without force
    const res = await PATCH(
      makeReq({ nextStatus: 'ON_SITE_CLIENT' }) as any,
      ctx as any,
    );
    expect(res.status).toBe(400);
    expect(mocks.txExecute).not.toHaveBeenCalled();
  });

  it('still sends notifyTaxiTransition by default (no silent flag)', async () => {
    await PATCH(
      makeReq({ nextStatus: 'EN_ROUTE_TO_CLIENT' }) as any,
      ctx as any,
    );
    expect(mocks.notifyTaxiTransition).toHaveBeenCalledTimes(1);
  });

  it('does NOT write TAXI_STATUS_FORCED log entry on standard transitions', async () => {
    await PATCH(
      makeReq({ nextStatus: 'EN_ROUTE_TO_CLIENT' }) as any,
      ctx as any,
    );
    expect(mocks.logAction).not.toHaveBeenCalled();
  });
});
