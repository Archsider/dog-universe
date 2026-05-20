// Booking-lifecycle integrity invariants.
//
// All queries read-only, indexed, and capped at 5 sample rows.
//
// Source : multi-agent audit Wave 4, 2026-05-20.

import { prisma } from '../prisma';
import type { InvariantResult } from './types';

/**
 * No ACCEPTED time proposal should outlive its booking's terminal state.
 * Wave 2 extended `supersedePendingForBooking` to sweep ACCEPTED too — this
 * invariant catches the long tail of legacy orphans that pre-date that fix
 * (their TimeProposal.respondedAt is from before 2026-05-20).
 */
export async function checkAcceptedProposalOrphaned(): Promise<InvariantResult> {
  const rows = await prisma.$queryRaw<Array<{
    id: string; bookingId: string; scope: string; bookingStatus: string;
  }>>`
    SELECT tp.id, tp."bookingId", tp.scope::text AS scope, b.status::text AS "bookingStatus"
    FROM "TimeProposal" tp
    JOIN "Booking" b ON b.id = tp."bookingId"
    WHERE tp.status = 'ACCEPTED'
      AND b.status IN ('CANCELLED', 'REJECTED', 'NO_SHOW')
    LIMIT 5
  `;
  const countRow = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c
    FROM "TimeProposal" tp
    JOIN "Booking" b ON b.id = tp."bookingId"
    WHERE tp.status = 'ACCEPTED'
      AND b.status IN ('CANCELLED', 'REJECTED', 'NO_SHOW')
  `;
  return {
    key: 'accepted_proposal_orphaned',
    label: 'TimeProposal ACCEPTED sur booking terminal (cascade incomplet)',
    count: Number(countRow[0]?.c ?? BigInt(0)),
    sample: rows,
    severity: 'warning',
  };
}

/**
 * Invoice.paidAmount must never go below -0.01 MAD.  Wave 2 added a
 * CHECK constraint (`Invoice_paidAmount_not_negative`) so the DB rejects
 * new violations, but this invariant flags any rows that were created
 * BEFORE the constraint was deployed.  Critical because refund-overshoot
 * means the books are off.
 */
export async function checkNegativePaidAmount(): Promise<InvariantResult> {
  const rows = await prisma.$queryRaw<Array<{
    id: string; invoiceNumber: string; paidAmount: string;
  }>>`
    SELECT id, "invoiceNumber", "paidAmount"::text AS "paidAmount"
    FROM "Invoice"
    WHERE "paidAmount" < -0.01
    ORDER BY "paidAmount" ASC
    LIMIT 5
  `;
  const countRow = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c FROM "Invoice" WHERE "paidAmount" < -0.01
  `;
  return {
    key: 'negative_paid_amount',
    label: 'Invoice.paidAmount négatif (refund overshoot)',
    count: Number(countRow[0]?.c ?? BigInt(0)),
    sample: rows,
    severity: 'critical',
  };
}

/**
 * Walk-in open-ended bookings are excluded from the capacity overlap
 * count (`src/lib/capacity.ts:124`).  This invariant detects when the
 * count of currently-active open-ended walk-ins by species exceeds the
 * configured capacity — operator should close them out (CloseStayDialog)
 * to free the cells.
 *
 * Capacity defaults : 20 DOG / 10 CAT.  We read the actual settings to
 * stay correct when admin tunes them.
 */
export async function checkOpenEndedOccupancyOverflow(): Promise<InvariantResult> {
  // Fetch configured capacity (fail-soft : default to 20/10 if unset).
  const settings = await prisma.setting.findMany({
    where: { key: { in: ['capacity_dog', 'capacity_cat'] } },
    select: { key: true, value: true },
  });
  const capacityByKey = new Map(settings.map((s) => [s.key, parseInt(s.value, 10) || 0]));
  const dogLimit = capacityByKey.get('capacity_dog') ?? 20;
  const catLimit = capacityByKey.get('capacity_cat') ?? 10;

  // Count active open-ended walk-ins per species.
  const rows = await prisma.$queryRaw<Array<{ species: string; n: bigint }>>`
    SELECT p.species, COUNT(*)::bigint AS n
    FROM "Booking" b
    JOIN "BookingPet" bp ON bp."bookingId" = b.id
    JOIN "Pet" p         ON p.id          = bp."petId"
    WHERE b."isOpenEnded" = TRUE
      AND b.status        = 'IN_PROGRESS'
      AND b."deletedAt"   IS NULL
      AND p."deletedAt"   IS NULL
    GROUP BY p.species
  `;

  const sample: Array<Record<string, unknown>> = [];
  let count = 0;
  for (const r of rows) {
    const n = Number(r.n);
    const limit = r.species === 'CAT' ? catLimit : dogLimit;
    if (n > limit) {
      count += n - limit;
      sample.push({
        species: r.species,
        active: n,
        limit,
        overflow: n - limit,
      });
    }
  }

  return {
    key: 'open_ended_occupancy_overflow',
    label: 'Walk-ins open-ended actifs dépassant la capacité configurée',
    count,
    sample,
    severity: 'warning',
  };
}
