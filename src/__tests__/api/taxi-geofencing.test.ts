/**
 * API tests — POST /api/taxi/[token]/heartbeat (geofencing branch)
 *
 * Geofencing now uses a hysteresis state machine (FAR → NEAR → ARRIVED) with
 * a 30s dwell-time before promotion to ARRIVED. The tests pre-seed the
 * cacheGet mock to simulate the previous zone state.
 *
 * Status guard updated: EN_ROUTE_TO_CLIENT (was DRIVER_EN_ROUTE — never set
 * anywhere in the code; the geofencing block was unreachable).
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: { taxiTrip: { findUnique: vi.fn() } },
  recordHeartbeat: vi.fn().mockResolvedValue(undefined),
  recordLocation: vi.fn().mockResolvedValue(undefined),
  getLocation: vi.fn().mockResolvedValue(null),
  haversineKm: vi.fn(() => 0),
  haversineDistance: vi.fn(),
  tryAcquireFlag: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  cacheDel: vi.fn().mockResolvedValue(undefined),
  maybeAutoTransition: vi.fn().mockResolvedValue(null),
  createTaxiNearPickupNotification: vi.fn().mockResolvedValue(undefined),
  createTaxiArrivedNotification: vi.fn().mockResolvedValue(undefined),
  verifyTaxiToken: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/taxi-heartbeat', () => ({ recordHeartbeat: mocks.recordHeartbeat }));
vi.mock('@/lib/taxi-location', () => ({
  recordLocation: mocks.recordLocation,
  getLocation: mocks.getLocation,
  haversineKm: mocks.haversineKm,
}));
vi.mock('@/lib/geo', () => ({ haversineDistance: mocks.haversineDistance }));
vi.mock('@/lib/cache', () => ({
  tryAcquireFlag: mocks.tryAcquireFlag,
  cacheGet: mocks.cacheGet,
  cacheSet: mocks.cacheSet,
  cacheDel: mocks.cacheDel,
}));
vi.mock('@/lib/taxi-auto-transition', () => ({ maybeAutoTransition: mocks.maybeAutoTransition }));
vi.mock('@/lib/taxi-token', () => ({ verifyTaxiToken: mocks.verifyTaxiToken }));
vi.mock('@/lib/notifications', () => ({
  createTaxiNearPickupNotification: mocks.createTaxiNearPickupNotification,
  createTaxiArrivedNotification: mocks.createTaxiArrivedNotification,
}));

import { POST as Heartbeat } from '@/app/api/taxi/[token]/heartbeat/route';

const TOKEN = 'tok_123abc';

function makeReq(body: unknown) {
  return new Request(`http://x/api/taxi/${TOKEN}/heartbeat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  }) as never;
}

const ctx = { params: Promise.resolve({ token: TOKEN }) };

function tripFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'trip-1',
    bookingId: 'book-1',
    tripType: 'STANDALONE',
    status: 'EN_ROUTE_TO_CLIENT',
    trackingToken: TOKEN,
    trackingTokenExpiresAt: null,
    booking: {
      status: 'IN_PROGRESS',
      serviceType: 'PET_TAXI',
      deletedAt: null,
      clientId: 'client-1',
      taxiDetail: { pickupLat: 33.5731, pickupLng: -7.5898, dropoffLat: null, dropoffLng: null },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tryAcquireFlag.mockResolvedValue(true);
  mocks.cacheGet.mockResolvedValue(null);
  mocks.haversineDistance.mockReset();
  mocks.prisma.taxiTrip.findUnique.mockResolvedValue(tripFixture());
});

describe('POST /api/taxi/[token]/heartbeat — geofencing', () => {
  const validBody = { latitude: 33.57, longitude: -7.59, accuracy: 10 };

  it('< 100m with prior NEAR + dwell satisfied → fires TAXI_ARRIVED', async () => {
    mocks.haversineDistance.mockReturnValue(50);
    // Pre-seed: zone=NEAR with nearSince 60s ago — dwell satisfied.
    mocks.cacheGet.mockResolvedValueOnce({ zone: 'NEAR', nearSince: Date.now() - 60_000 });
    const res = await Heartbeat(makeReq(validBody), ctx);
    expect(res.status).toBe(200);
    expect(mocks.tryAcquireFlag).toHaveBeenCalledWith(
      'taxi:arrived_alert:book-1', 3600,
    );
    expect(mocks.createTaxiArrivedNotification).toHaveBeenCalledWith('client-1', 'book-1', 'fr');
    expect(mocks.createTaxiNearPickupNotification).not.toHaveBeenCalled();
  });

  it('< 100m fresh entry (zone=FAR) → enters NEAR, NO ARRIVED yet (dwell)', async () => {
    mocks.haversineDistance.mockReturnValue(50);
    mocks.cacheGet.mockResolvedValueOnce({ zone: 'FAR' });
    const res = await Heartbeat(makeReq(validBody), ctx);
    expect(res.status).toBe(200);
    expect(mocks.createTaxiArrivedNotification).not.toHaveBeenCalled();
    // NEAR state was written
    expect(mocks.cacheSet).toHaveBeenCalled();
  });

  it('100m–1000m fresh (zone=FAR) → fires TAXI_NEAR_PICKUP + acquires flag', async () => {
    mocks.haversineDistance.mockReturnValue(500);
    mocks.cacheGet.mockResolvedValueOnce({ zone: 'FAR' });
    const res = await Heartbeat(makeReq(validBody), ctx);
    expect(res.status).toBe(200);
    expect(mocks.tryAcquireFlag).toHaveBeenCalledWith(
      'taxi:near_alert:book-1', 3600,
    );
    expect(mocks.createTaxiNearPickupNotification).toHaveBeenCalledWith(
      'client-1', 'book-1', 500, 'fr',
    );
    expect(mocks.createTaxiArrivedNotification).not.toHaveBeenCalled();
  });

  it('> 1000m → no notification, no flag claim', async () => {
    mocks.haversineDistance.mockReturnValue(5000);
    const res = await Heartbeat(makeReq(validBody), ctx);
    expect(res.status).toBe(200);
    expect(mocks.tryAcquireFlag).not.toHaveBeenCalled();
    expect(mocks.createTaxiNearPickupNotification).not.toHaveBeenCalled();
    expect(mocks.createTaxiArrivedNotification).not.toHaveBeenCalled();
  });

  it('flag already taken (replay) → no notification fired', async () => {
    mocks.haversineDistance.mockReturnValue(50);
    mocks.cacheGet.mockResolvedValueOnce({ zone: 'NEAR', nearSince: Date.now() - 60_000 });
    mocks.tryAcquireFlag.mockResolvedValueOnce(false);
    const res = await Heartbeat(makeReq(validBody), ctx);
    expect(res.status).toBe(200);
    expect(mocks.tryAcquireFlag).toHaveBeenCalled();
    expect(mocks.createTaxiArrivedNotification).not.toHaveBeenCalled();
  });

  it('pickup coords absent → no geofencing call', async () => {
    mocks.prisma.taxiTrip.findUnique.mockResolvedValueOnce(
      tripFixture({
        booking: {
          status: 'IN_PROGRESS',
          serviceType: 'PET_TAXI',
          deletedAt: null,
          clientId: 'client-1',
          taxiDetail: { pickupLat: null, pickupLng: null, dropoffLat: null, dropoffLng: null },
        },
      }),
    );
    mocks.haversineDistance.mockReturnValue(50);
    const res = await Heartbeat(makeReq(validBody), ctx);
    expect(res.status).toBe(200);
    expect(mocks.haversineDistance).not.toHaveBeenCalled();
    expect(mocks.createTaxiArrivedNotification).not.toHaveBeenCalled();
  });

  it('trip status != EN_ROUTE_TO_CLIENT → no geofencing notification', async () => {
    mocks.prisma.taxiTrip.findUnique.mockResolvedValueOnce(
      tripFixture({ status: 'ON_SITE_CLIENT' }),
    );
    mocks.haversineDistance.mockReturnValue(50);
    const res = await Heartbeat(makeReq(validBody), ctx);
    expect(res.status).toBe(200);
    expect(mocks.tryAcquireFlag).not.toHaveBeenCalled();
    expect(mocks.createTaxiArrivedNotification).not.toHaveBeenCalled();
  });

  it('Redis down (cacheGet throws) → fail-open: heartbeat OK', async () => {
    mocks.haversineDistance.mockReturnValue(50);
    mocks.cacheGet.mockRejectedValueOnce(new Error('redis down'));
    const res = await Heartbeat(makeReq(validBody), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});
