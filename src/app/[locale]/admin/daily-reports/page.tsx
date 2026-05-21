import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { todayCasaYmd } from '@/lib/daily-reports';
import DailyReportsClient from './DailyReportsClient';

interface PageProps {
  params:       Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string }>;
}

export default async function DailyReportsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    redirect(`/${locale}/auth/login`);
  }

  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
    ? sp.date
    : todayCasaYmd();

  // Compte les animaux réellement présents en pension (IN_PROGRESS BOARDING)
  // — utilisé pour différencier le vrai empty state ("aucun animal") du
  // cas "les brouillons n'ont pas encore été générés par le cron 16h".
  // Le screenshot 2026-05-21 01:45 montrait l'empty state alors qu'il y
  // avait des animaux — la copy était trompeuse.
  const petsInPensionCount = await prisma.bookingPet.count({
    where: {
      booking: {
        ...notDeleted(),
        status: 'IN_PROGRESS',
        serviceType: 'BOARDING',
      },
      // eslint-disable-next-line dog-universe/no-inline-deletedAt-null -- OK: nested filter on Pet, notDeleted() targets top-level queries
      pet: { deletedAt: null },
    },
  });

  const reports = await prisma.dailyReport.findMany({
    where: { date },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      bookingId: true,
      petId: true,
      date: true,
      photoUrls: true,
      moodEmoji: true,
      foodEmoji: true,
      sleepEmoji: true,
      playEmoji: true,
      note: true,
      status: true,
      sentAt: true,
      skipReason: true,
      emailFailed: true,
      pet: {
        select: {
          name: true,
          species: true,
          photoUrl: true,
          isPermanentResident: true,
        },
      },
      booking: {
        select: {
          client: {
            select: {
              id: true,
              name: true,
              firstName: true,
              email: true,
              phone: true,
              isWalkIn: true,
            },
          },
        },
      },
    },
  });

  // Plain JSON-serializable shape — Dates → ISO strings.
  const serialized = reports.map(r => ({
    ...r,
    sentAt: r.sentAt ? r.sentAt.toISOString() : null,
  }));

  const isSuperadmin = session.user.role === 'SUPERADMIN';

  return (
    <DailyReportsClient
      locale={locale}
      date={date}
      initialReports={serialized}
      petsInPensionCount={petsInPensionCount}
      canTriggerCron={isSuperadmin}
    />
  );
}
