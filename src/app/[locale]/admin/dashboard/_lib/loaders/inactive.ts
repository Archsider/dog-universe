import { addDays } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { startOfTodayCasa, casablancaStartOfDay, casablancaYMD } from '@/lib/dates-casablanca';
import { notDeleted } from '@/lib/prisma-soft';
import type { InactiveClient } from '../shapes';

// Raw-SQL row shape — single trip to Postgres returns just the 3 client IDs
// whose `MAX(activity)` is older than the 6-month cutoff. We then hydrate
// those 3 (name, phone, last pet name) via a small Prisma `findMany`.
//
// Why raw SQL: the previous Prisma `user.findMany` pulled EVERY non-walkin
// CLIENT with their last booking + last invoice + last payment into memory,
// then JS-filtered for the < 1% that were inactive. At 500 clients that
// loaded 1500 sub-rows on every dashboard render; at 5k it would be a
// 5-10 second pause. The activity filter + ORDER BY + LIMIT now happen at
// the DB layer using indexes on `Booking.clientId` and `Invoice.clientId`.
type InactiveRow = { clientId: string; lastInteraction: Date };

export async function loadInactiveClients(): Promise<InactiveClient[]> {
  // Activity metric per Mehdi: max(lastBooking.startDate, lastPayment
  // .paymentDate). Anything older than 6 months → at-risk. Walk-in
  // clients excluded (they're one-shot). Limit to 3 for the dashboard
  // panel ; sidebar already exposes /admin/clients for the full list.
  const cutoff = casablancaStartOfDay(addDays(new Date(), -180));

  // Step 1: SQL-side filter + ORDER + LIMIT. Returns at most 3 rows.
  //   - `b.deletedAt IS NULL` matches `notDeleted()` for bookings.
  //   - Payment rows have no `deletedAt` column (audit-permanent).
  //   - `COALESCE(MAX(...), '1970-01-01')` avoids NULL-poisoning of
  //     GREATEST when a client has never booked or paid.
  //   - Clients with no activity at all (lastInteraction = epoch) are
  //     filtered out — they're brand-new accounts, not "inactive" yet.
  const inactiveRows = await prisma.$queryRaw<InactiveRow[]>`
    WITH activity AS (
      SELECT
        u.id AS "clientId",
        GREATEST(
          COALESCE((
            SELECT MAX(b."startDate")
            FROM "Booking" b
            WHERE b."clientId" = u.id AND b."deletedAt" IS NULL
          ), '1970-01-01'::timestamp),
          COALESCE((
            SELECT MAX(p."paymentDate")
            FROM "Payment" p
            JOIN "Invoice" i ON p."invoiceId" = i.id
            WHERE i."clientId" = u.id
          ), '1970-01-01'::timestamp)
        ) AS "lastInteraction"
      FROM "User" u
      WHERE u.role = 'CLIENT'
        AND u."isWalkIn" = false
        AND u."deletedAt" IS NULL
    )
    SELECT "clientId", "lastInteraction"
    FROM activity
    WHERE "lastInteraction" < ${cutoff}
      AND "lastInteraction" > '1970-01-01'::timestamp
    ORDER BY "lastInteraction" ASC
    LIMIT 3
  `;

  if (inactiveRows.length === 0) return [];

  // Step 2: hydrate the 3 inactive clients with name, phone, and their
  // most-recent pet name (for the dashboard card label). At most 3 rows,
  // so this is cheap regardless of total client count.
  const detailed = await prisma.user.findMany({
    where: { id: { in: inactiveRows.map((r) => r.clientId) } },
    select: {
      id: true,
      name: true,
      phone: true,
      bookings: {
        where: notDeleted(),
        select: {
          bookingPets: { select: { pet: { select: { name: true } } } },
        },
        orderBy: { startDate: 'desc' },
        take: 1,
      },
    },
  });
  const byId = new Map(detailed.map((c) => [c.id, c]));

  // Preserve the SQL-imposed ordering (oldest activity first).
  const today = startOfTodayCasa();
  return inactiveRows.flatMap((row) => {
    const c = byId.get(row.clientId);
    if (!c) return [];
    const ymd = casablancaYMD(row.lastInteraction);
    const days = Math.round(
      (today.getTime() - casablancaStartOfDay(row.lastInteraction).getTime()) / 86_400_000,
    );
    return [{
      clientId: c.id,
      clientName: c.name ?? '',
      clientPhone: c.phone,
      lastPetName: c.bookings[0]?.bookingPets[0]?.pet?.name ?? null,
      lastInteractionYmd: `${ymd.year}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`,
      daysSince: days,
    }];
  });
}
