// Auto-transition taxi trip status based on geofence approach.
//
// Triggered from both position-write endpoints (admin tracking + driver
// heartbeat) so the trip advances automatically when the driver enters a
// 50 m radius around pickup or dropoff.
//
// Only the *approach* transitions are automated:
//   - EN_ROUTE_TO_CLIENT  → ON_SITE_CLIENT          (within 50 m of pickup)
//   - ANIMAL_ON_BOARD     → <canonical terminal>    (within 50 m of dropoff)
//       OUTBOUND/STANDALONE → ARRIVED_AT_PENSION ; RETURN → ARRIVED_AT_CLIENT
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
import { clearLocation } from '@/lib/taxi-location';
import { notifyTaxiTransition } from '@/lib/taxi-notifications';
import { logger } from '@/lib/logger';

const AUTO_TRANSITION_RADIUS_M = 50;
const AUTO_TRANSITION_TTL_SEC = 600; // 10 min

// Canonical dropoff terminal per trip type — MUST mirror TERMINAL_FOR_TYPE in
// the manual status route (/api/admin/taxi-trips/[id]/status). RETURN ends at
// the client's home (ARRIVED_AT_CLIENT); OUTBOUND/STANDALONE end at the pension
// (ARRIVED_AT_PENSION). The legacy 'ARRIVED_AT_DESTINATION' written here before
// was recognised by NO consumer (history/dashboard/board/driver) → trips got
// stuck "active" forever and vanished from history.
const DROPOFF_TERMINAL_FOR_TYPE: Record<string, string> = {
  OUTBOUND: 'ARRIVED_AT_PENSION',
  STANDALONE: 'ARRIVED_AT_PENSION',
  RETURN: 'ARRIVED_AT_CLIENT',
};
const TERMINAL_STATUSES = new Set(['ARRIVED_AT_PENSION', 'ARRIVED_AT_CLIENT']);

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

  // 'dropoff' resolves to the canonical terminal once we know the tripType
  // (fetched fresh inside the tx). 'intermediate' carries an explicit status.
  let target: { kind: 'intermediate' | 'dropoff'; newStatus?: string } | null = null;

  if (
    currentStatus === 'EN_ROUTE_TO_CLIENT' &&
    pickupLat != null &&
    pickupLng != null
  ) {
    const d = haversineDistance(currentLat, currentLng, pickupLat, pickupLng);
    if (d < AUTO_TRANSITION_RADIUS_M) {
      target = { kind: 'intermediate', newStatus: 'ON_SITE_CLIENT' };
    }
  } else if (
    currentStatus === 'ANIMAL_ON_BOARD' &&
    dropoffLat != null &&
    dropoffLng != null
  ) {
    const d = haversineDistance(currentLat, currentLng, dropoffLat, dropoffLng);
    if (d < AUTO_TRANSITION_RADIUS_M) {
      target = { kind: 'dropoff' };
    }
  }

  if (!target) return null;

  // Idempotence: don't re-fire for this trip + transition kind during the TTL.
  const flagKey = `taxi:auto_transition:${tripId}:${target.kind === 'dropoff' ? 'DROPOFF' : target.newStatus}`;
  const acquired = await tryAcquireFlag(flagKey, AUTO_TRANSITION_TTL_SEC);
  if (!acquired) return null;

  // Re-check current status inside the transaction to avoid a race with a
  // manual admin transition that may have happened between read and write.
  // Returns the committed status (+ context) or null on no-op so we don't fire
  // SMS / clearLocation when the status already advanced manually.
  const committed = await prisma.$transaction(async (tx) => {
    const fresh = await tx.taxiTrip.findUnique({
      where: { id: tripId },
      select: { status: true, tripType: true, bookingId: true },
    });
    if (!fresh || fresh.status !== currentStatus) return null;

    const newStatus = target!.kind === 'dropoff'
      ? (DROPOFF_TERMINAL_FOR_TYPE[fresh.tripType] ?? 'ARRIVED_AT_PENSION')
      : target!.newStatus!;
    const isTerminal = TERMINAL_STATUSES.has(newStatus);

    // On terminal: mirror the manual status route — stop the SSE stream
    // (trackingActive=false) and invalidate the public link (trackingToken=null).
    await tx.taxiTrip.update({
      where: { id: tripId },
      data: isTerminal
        ? { status: newStatus, trackingActive: false, trackingToken: null }
        : { status: newStatus },
    });
    await tx.taxiStatusHistory.create({
      data: {
        taxiTripId: tripId,
        status: newStatus,
        updatedBy: 'AUTO_GEOFENCE',
      },
    });
    // STANDALONE booking completion parity with the manual route. Guarded on
    // IN_PROGRESS via updateMany so we never clobber a CANCELLED booking.
    if (isTerminal && fresh.tripType === 'STANDALONE') {
      await tx.booking.updateMany({
        where: { id: fresh.bookingId, status: 'IN_PROGRESS' },
        data: { status: 'COMPLETED' },
      });
    }
    return { newStatus, isTerminal, bookingId: fresh.bookingId };
  });

  if (!committed) return null;

  // Drop the stale Redis location so the map doesn't linger post-arrival.
  if (committed.isTerminal) {
    await clearLocation(committed.bookingId);
  }

  // Symmetry with manual PATCH /api/admin/taxi-trips/[id]/status: send the
  // same SMS suite to the client + admin so an auto-transition behaves
  // identically from the user's perspective.
  try {
    const ctx = await prisma.taxiTrip.findUnique({
      where: { id: tripId },
      select: {
        booking: {
          select: {
            client: { select: { name: true, phone: true } },
            bookingPets: { select: { pet: { select: { name: true, species: true, gender: true } } } },
          },
        },
      },
    });
    await notifyTaxiTransition(committed.newStatus, {
      clientName: ctx?.booking?.client?.name ?? '',
      clientPhone: ctx?.booking?.client?.phone ?? null,
      pets: ctx?.booking?.bookingPets.map(bp => bp.pet) ?? [],
    });
  } catch (err) {
    logger.error('taxi-auto-transition', 'notify failed (non-blocking)', { tripId, newStatus: committed.newStatus, error: err instanceof Error ? err.message : String(err) });
  }

  return committed.newStatus;
}
