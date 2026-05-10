// /admin/guardian — SUPERADMIN only.
// Lists the 30 most recent GuardianEvent rows produced by the Sentry webhook
// triage pipeline.
import { redirect } from 'next/navigation';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import GuardianClient from './GuardianClient';

export const dynamic = 'force-dynamic';

export default async function GuardianPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();
  if (session?.user?.role !== 'SUPERADMIN') {
    redirect(`/${locale}/admin/dashboard`);
  }

  const events = await prisma.guardianEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  const isFr = locale === 'fr';

  return (
    <GuardianClient
      isFr={isFr}
      events={events.map((e) => ({
        id: e.id,
        sentryEventId: e.sentryEventId,
        sentryIssueId: e.sentryIssueId,
        title: e.title,
        culprit: e.culprit,
        level: e.level,
        classification: e.classification,
        severity: e.severity,
        action: e.action,
        reason: e.reason,
        githubIssueUrl: e.githubIssueUrl,
        occurrencesSeen: e.occurrencesSeen,
        createdAt: e.createdAt.toISOString(),
      }))}
    />
  );
}
