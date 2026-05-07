/**
 * API tests — POST /api/taxi/[token]/heartbeat (geofencing branch)
 *
 * On exerce uniquement le bloc geofencing (pickup near / arrived) en variant
 * la distance entre la position GPS du chauffeur et le pickup. Les autres
 * branches (validation lat/lng, accuracy gate, speed outlier) sont déjà
 * couvertes implicitement par recordLocation/recordHeartbeat.
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
  maybeAutoTransition: vi.fn().mockResolvedValue(null),
  createTaxiNearPickupNotification: vi.fn().mockResolvedValue(undefined),
  createTaxiArrivedNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/taxi-heartbeat', () => ({ recordHeartbeat: mocks.recordHeartbeat }));
vi.mock('@/lib/taxi-location', () => ({
  recordLocation: mocks.recordLocation,
  getLocation: mocks.getLocation,
  haversineKm: mocks.haversineKm,
}));
vi.mock('@/lib/geo', () => ({ haversineDistance: mocks.haversineDistance }));
vi.mock('@/lib/cache', () => ({ tryAcquireFlag: mocks.tryAcquireFlag }));
vi.mock('@/lib/taxi-auto-transition', () => ({ maybeAutoTransition: mocks.maybeAutoTransition }));
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
    status: 'DRIVER_EN_ROUTE',
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
  mocks.haversineDistance.mockReset();
  mocks.prisma.taxiTrip.findUnique.mockResolvedValue(tripFixture());
});

describe('POST /api/taxi/[token]/heartbeat — geofencing', () => {
  const validBody = { latitude: 33.57, longitude: -7.59, accuracy: 10 };

  it('< 100m → fires TAXI_ARRIVED + acquires flag', async () => {
    mocks.haversineDistance.mockReturnValue(50);
    const res = await Heartbeat(makeReq(validBody), ctx);
    expect(res.status).toBe(200);
    expect(mocks.tryAcquireFlag).toHaveBeenCalledWith(
      'taxi:arrived_alert:book-1', 3600,
    );
    expect(mocks.createTaxiArrivedNotification).toHaveBeenCalledWith('client-1', 'book-1', 'fr');
    expect(mocks.createTaxiNearPickupNotification).not.toHaveBeenCalled();
  });

  it('100m–1000m → fires TAXI_NEAR_PICKUP + acquires flag', async () => {
    mocks.haversineDistance.mockReturnValue(500);
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

  it('trip status != DRIVER_EN_ROUTE → no geofencing notification', async () => {
    mocks.prisma.taxiTrip.findUnique.mockResolvedValueOnce(
      tripFixture({ status: 'AT_PICKUP' }),
    );
    mocks.haversineDistance.mockReturnValue(50);
    const res = await Heartbeat(makeReq(validBody), ctx);
    expect(res.status).toBe(200);
    expect(mocks.tryAcquireFlag).not.toHaveBeenCalled();
    expect(mocks.createTaxiArrivedNotification).not.toHaveBeenCalled();
  });

  it('Redis down (tryAcquireFlag throws) → fail-open: heartbeat OK', async () => {
    mocks.haversineDistance.mockReturnValue(50);
    mocks.tryAcquireFlag.mockRejectedValueOnce(new Error('redis down'));
    const res = await Heartbeat(makeReq(validBody), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});
