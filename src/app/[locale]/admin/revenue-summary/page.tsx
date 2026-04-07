import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import RevenueSummaryManager from './RevenueSummaryManager';

interface PageProps { params: { locale: string } }

export default async function RevenueSummaryPage({ params: { locale } }: PageProps) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    redirect(`/${locale}/auth/login`);
  }

  const summaries = await prisma.monthlyRevenueSummary.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    include: { author: { select: { name: true } } },
  });

  return (
    <RevenueSummaryManager
      initialSummaries={summaries}
      isSuperAdmin={session.user.role === 'SUPERADMIN'}
      locale={locale}
    />
  );
}
