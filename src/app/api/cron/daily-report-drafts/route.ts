// GET /api/cron/daily-report-drafts
//
// Runs daily at 16h Casa (configured in vercel.json).  For every pet
// currently in IN_PROGRESS boarding (= physically present at the
// facility today, including permanent residents like Mama), it creates a
// DRAFT row in `DailyReport` so admin can curate + send the daily update
// to the owner from the /admin/daily-reports page.
//
// Idempotent : the `(petId, date)` unique constraint prevents duplicates
// when the cron is replayed.  Manual re-create is fine — the SQL upsert
// pattern is a no-op on second call.

import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { defineCron } from '@/lib/cron-runner';
import { todayCasaYmd } from '@/lib/daily-reports';

export const maxDuration = 60;

export const GET = defineCron({
  name: 'daily-report-drafts',
  period: 'daily',
  fn: async () => {
    const today = todayCasaYmd();

    // Find every pet currently in IN_PROGRESS boarding. Walk-in clients
    // included — but they have no portal email, so the send step will
    // skip the email and only the WhatsApp manual share is meaningful.
    // Pivot via BookingPet directly — `Pet` is a 1:1 (not nullable) relation
    // so we filter on pet.deletedAt at this level instead of using a nested
    // `where` on a non-list relation (which Prisma doesn't allow).
    const links = await prisma.bookingPet.findMany({
      where: {
        booking: {
          ...notDeleted(),
          status: 'IN_PROGRESS',
          serviceType: 'BOARDING',
        },
        // eslint-disable-next-line dog-universe/no-inline-deletedAt-null -- OK: nested filter on Pet, notDeleted() targets top-level queries
        pet: { deletedAt: null },
      },
      select: { bookingId: true, petId: true },
    });
    const targets = links;

    // Insertion en un seul batch (createMany) au lieu d'un create() par pet.
    // skipDuplicates s'appuie sur l'unique (petId, date) → idempotent sur
    // replay du cron (remplace l'ancien try/catch P2002 par row).
    let created = 0;
    if (targets.length > 0) {
      const res = await prisma.dailyReport.createMany({
        data: targets.map((t) => ({
          bookingId: t.bookingId,
          petId: t.petId,
          date: today,
          createdBy: 'cron-system',
        })),
        skipDuplicates: true,
      });
      created = res.count;
    }

    return {
      date: today,
      petsInProgress: targets.length,
      draftsCreated: created,
      alreadyExisting: targets.length - created,
    };
  },
});
