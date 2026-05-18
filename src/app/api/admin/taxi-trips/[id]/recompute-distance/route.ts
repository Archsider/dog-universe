// Retroactive distance correction for a single trip. Reads every stored
// TaxiLocation row, replays them through the same shouldCountFix() pipeline
// the live ingestion uses, and writes the corrected `distanceKm` back.
//
// Use case: trips logged before the GPS filter was tightened (2026-05-14)
// can show grossly inflated distances (e.g. 64 km for a 5 km ride) because
// the previous 10 m threshold counted GPS drift as movement. This endpoint
// recomputes them from raw points — no re-tracking required.
//
// Idempotent: replaying twice yields the same result (pure function over
// the stored rows). Safe to call multiple times.

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { recomputeDistance } from '@/lib/taxi-gps-filter';
import { logAction } from '@/lib/log';
import { logger } from '@/lib/logger';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const trip = await prisma.taxiTrip.findUnique({
    where: { id },
    select: { id: true, distanceKm: true },
  });
  if (!trip) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Pull ALL points for this trip (no cap — we need the full track).
  // 50 fixes/min × 60 min = 3000 rows worst case; well within Prisma defaults.
  const points = await prisma.taxiLocation.findMany({
    where: { taxiTripId: id },
    orderBy: { createdAt: 'asc' },
    select: { latitude: true, longitude: true, accuracy: true, createdAt: true },
  });

  if (points.length < 2) {
    return NextResponse.json({
      ok: true,
      before: trip.distanceKm,
      after: 0,
      pointsCount: points.length,
      message: 'Not enough points to compute distance',
    });
  }

  const result = recomputeDistance(points);
  const before = trip.distanceKm;

  await prisma.taxiTrip.update({
    where: { id },
    data: { distanceKm: result.distanceKm },
  });

  logger.info('taxi-tracking', 'distance recomputed', {
    tripId: id,
    before,
    after: result.distanceKm,
    pointsCount: points.length,
    pairsEvaluated: result.pairsEvaluated,
    pairsCounted: result.pairsCounted,
    rejected: result.rejectedByReason,
  });

  await logAction({
    userId: session.user.id,
    action: 'TAXI_DISTANCE_RECOMPUTED',
    entityType: 'TaxiTrip',
    entityId: id,
    details: {
      before,
      after: result.distanceKm,
      pointsCount: points.length,
      pairsEvaluated: result.pairsEvaluated,
      pairsCounted: result.pairsCounted,
      rejectedByReason: result.rejectedByReason,
    },
  });

  return NextResponse.json({
    ok: true,
    before,
    after: result.distanceKm,
    pointsCount: points.length,
    pairsEvaluated: result.pairsEvaluated,
    pairsCounted: result.pairsCounted,
    rejectedByReason: result.rejectedByReason,
  });
}
