// Feature flags admin page — SUPERADMIN only.
import { redirect } from 'next/navigation';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import FeatureFlagsClient, { type FlagRow } from './FeatureFlagsClient';

export default async function FeatureFlagsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();

  if (session?.user?.role !== 'SUPERADMIN') {
    redirect(`/${locale}/admin/dashboard`);
  }

  const rows = await prisma.featureFlag.findMany({
    orderBy: { key: 'asc' },
    take: 500,
  });

  const flags: FlagRow[] = rows.map((r) => ({
    key: r.key,
    description: r.description,
    enabled: r.enabled,
    rolloutPercent: r.rolloutPercent,
    targetRoles: r.targetRoles,
    userWhitelist: r.userWhitelist,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return <FeatureFlagsClient locale={locale} initialFlags={flags} />;
}
