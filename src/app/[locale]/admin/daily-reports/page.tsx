import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
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

  return (
    <DailyReportsClient
      locale={locale}
      date={date}
      initialReports={serialized}
    />
  );
}
