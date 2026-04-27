import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import RevenueSummaryManager from './RevenueSummaryManager';
import { AlertTriangle } from 'lucide-react';

interface PageProps { params: Promise<{ locale: string }> }

export default async function RevenueSummaryPage({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    redirect(`/${locale}/auth/login`);
  }

  type SummaryWithAuthor = Awaited<ReturnType<typeof prisma.monthlyRevenueSummary.findMany<{ include: { author: { select: { name: true } } } }>>>;
  let summaries: SummaryWithAuthor = [];
  let migrationPending = false;

  try {
    summaries = await prisma.monthlyRevenueSummary.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { author: { select: { name: true } } },
    });
  } catch {
    // Table doesn't exist yet — migration not yet applied on production DB
    migrationPending = true;
  }

  if (migrationPending) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-serif font-bold text-charcoal">
          {locale === 'fr' ? 'Données historiques de revenus' : 'Historical Revenue Data'}
        </h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-4">
          <AlertTriangle className="h-6 w-6 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-3 min-w-0">
            <p className="font-semibold text-amber-800">
              {locale === 'fr'
                ? 'Migration SQL requise — table non trouvée'
                : 'Migration required — table not found'}
            </p>
            <p className="text-sm text-amber-700">
              {locale === 'fr'
                ? 'Exécutez ce SQL dans Supabase → SQL Editor, puis rechargez la page :'
                : 'Run this SQL in Supabase → SQL Editor, then reload this page:'}
            </p>
            <pre className="bg-white border border-amber-200 rounded-lg p-4 text-xs font-mono text-gray-700 overflow-x-auto">{`CREATE TABLE "MonthlyRevenueSummary" (
    "id"              TEXT NOT NULL,
    "year"            INTEGER NOT NULL,
    "month"           INTEGER NOT NULL,
    "boardingRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "groomingRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxiRevenue"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherRevenue"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes"           TEXT,
    "createdBy"       TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonthlyRevenueSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthlyRevenueSummary_year_month_key"
    ON "MonthlyRevenueSummary"("year", "month");

CREATE INDEX "MonthlyRevenueSummary_year_idx"
    ON "MonthlyRevenueSummary"("year");

ALTER TABLE "MonthlyRevenueSummary"
    ADD CONSTRAINT "MonthlyRevenueSummary_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;`}</pre>
          </div>
        </div>
      </div>
    );
  }

  return (
    <RevenueSummaryManager
      initialSummaries={summaries}
      isSuperAdmin={session.user.role === 'SUPERADMIN'}
      locale={locale}
    />
  );
}
