// Auto-transition taxi trip status based on geofence approach.
//
// Triggered from both position-write endpoints (admin tracking + driver
// heartbeat) so the trip advances automatically when the driver enters a
// 50 m radius around pickup or dropoff.
//
// Only the *approach* transitions are automated:
//   - EN_ROUTE_TO_CLIENT  → ON_SITE_CLIENT          (within 50 m of pickup)
//   - ANIMAL_ON_BOARD     → ARRIVED_AT_DESTINATION  (within 50 m of dropoff)
//
// The intermediate ON_SITE_CLIENT → ANIMAL_ON_BOARD transition is *manual*:
// only the driver knows when the pet is actually inside the vehicle.
//
// Idempotence: a Redis flag `taxi:auto_transition:{tripId}:{newStatus}` SET
// NX EX 600 prevents duplicate transitions on rapid pings. Fail-open: if
// Redis is down the helper still attempts the DB transition (worst case:
// duplicate history rows, harmless).

import { prisma } from '@/lib/prisma';
import { haversineDistance } from '@/lib/geo';
import { tryAcquireFlag } from '@/lib/cache';

const AUTO_TRANSITION_RADIUS_M = 50;
const AUTO_TRANSITION_TTL_SEC = 600; // 10 min

interface MaybeAutoTransitionArgs {
  tripId: string;
  currentStatus: string;
  currentLat: number;
  currentLng: number;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
}

export async function maybeAutoTransition(args: MaybeAutoTransitionArgs): Promise<string | null> {
  const {
    tripId,
    currentStatus,
    currentLat,
    currentLng,
    pickupLat,
    pickupLng,
    dropoffLat,
    dropoffLng,
  } = args;

  let target: { newStatus: string; lat: number; lng: number } | null = null;

  if (
    currentStatus === 'EN_ROUTE_TO_CLIENT' &&
    pickupLat != null &&
    pickupLng != null
  ) {
    const d = haversineDistance(currentLat, currentLng, pickupLat, pickupLng);
    if (d < AUTO_TRANSITION_RADIUS_M) {
      target = { newStatus: 'ON_SITE_CLIENT', lat: pickupLat, lng: pickupLng };
    }
  } else if (
    currentStatus === 'ANIMAL_ON_BOARD' &&
    dropoffLat != null &&
    dropoffLng != null
  ) {
    const d = haversineDistance(currentLat, currentLng, dropoffLat, dropoffLng);
    if (d < AUTO_TRANSITION_RADIUS_M) {
      target = { newStatus: 'ARRIVED_AT_DESTINATION', lat: dropoffLat, lng: dropoffLng };
    }
  }

  if (!target) return null;

  // Idempotence: don't re-fire for this trip + new status during the TTL.
  const flagKey = `taxi:auto_transition:${tripId}:${target.newStatus}`;
  const acquired = await tryAcquireFlag(flagKey, AUTO_TRANSITION_TTL_SEC);
  if (!acquired) return null;

  // Re-check current status inside the transaction to avoid a race with a
  // manual admin transition that may have happened between read and write.
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.taxiTrip.findUnique({
      where: { id: tripId },
      select: { status: true },
    });
    if (!fresh || fresh.status !== currentStatus) return;

    await tx.taxiTrip.update({
      where: { id: tripId },
      data: { status: target!.newStatus },
    });
    await tx.taxiStatusHistory.create({
      data: {
        taxiTripId: tripId,
        status: target!.newStatus,
        updatedBy: 'AUTO_GEOFENCE',
      },
    });
  });

  return target.newStatus;
}
