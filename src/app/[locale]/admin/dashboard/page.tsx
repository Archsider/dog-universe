// /admin — cockpit dashboard "Commandant".
//
// Decision (2026-05-16) : ZERO financial number on this page. This is an
// operational cockpit, not a financial statement. Money KPIs live on
// /admin/facturation and /admin/analytics (separate routes, separate
// mental models). The dashboard surfaces:
//   - Zone 1 "Maintenant"        — current occupancy, pending validations, today's flow
//   - Zone 2 "Cette semaine"     — 7-day capacity, expected arrivals/departures, birthdays
//   - Zone 3 "Alertes & rappels" — vaccines expiring, long stays, inactive clients, invariants
//
// All data loaded in one Promise.all via `loadDashboardSnapshot()`. Every
// Date boundary goes through the Casa helpers (`startOfTodayCasa`,
// `casablancaYMD`, …) — re-introducing `.getMonth()` / `.getDate()` on a
// raw `new Date()` here would silently shift queries on the UTC Vercel
// runtime. See docs/BUSINESS_RULES.md §6.

import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getDashboardLabels } from './_lib/labels';
import { loadDashboardSnapshot } from './_lib/queries';
import { firstNameOf } from './_lib/whatsapp';
import { PensionActuelleCard } from './_components/PensionActuelleCard';
import { AValiderCard } from './_components/AValiderCard';
import { AujourdhuiCard } from './_components/AujourdhuiCard';
import { Capacity7DaysChart } from './_components/Capacity7DaysChart';
import { UpcomingCards } from './_components/UpcomingCards';
import { BirthdaysCard } from './_components/BirthdaysCard';
import { VaccinesCard } from './_components/VaccinesCard';
import { LongStaysCard } from './_components/LongStaysCard';
import { InactiveClientsCard } from './_components/InactiveClientsCard';
import { CriticalInvariantsCard } from './_components/CriticalInvariantsCard';
import AdminGreeting from './_components/AdminGreeting';
import StatsHero from '@/components/admin/StatsHero';
import { loadStatsHero } from './_lib/stats-hero-data';

// ISR : revalidation 60 s. Les mutations admin invalident via
// `revalidateTag('admin-counts')` — pas un signal direct ici, mais le
// tag rafraîchit les compteurs PENDING dans la sidebar.
export const revalidate = 60;

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminDashboardPage({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    redirect(`/${locale}/auth/login`);
  }

  const labels = getDashboardLabels(locale);
  const [snapshot, statsHero] = await Promise.all([
    loadDashboardSnapshot(),
    loadStatsHero(),
  ]);
  const firstName = firstNameOf(session.user.name);

  return (
    <div className="space-y-8">
      {/* ── Header — luxe greeting (Wave 5 polish round 2) ── */}
      <header>
        <AdminGreeting
          firstName={firstName}
          locale={locale}
          arrivalsToday={snapshot.today.checkIns.length}
          inPension={snapshot.pension.dogsIn + snapshot.pension.catsIn}
          pending={snapshot.pending.count}
        />
      </header>

      {/* Wave 6 Feature #6 — Stats Hero (CA + séjours + occupancy) */}
      <StatsHero
        monthRevenue={statsHero.monthRevenue}
        monthRevenuePrev={statsHero.monthRevenuePrev}
        monthStays={statsHero.monthStays}
        monthStaysPrev={statsHero.monthStaysPrev}
        occupancyDogPct={statsHero.occupancyDogPct}
        occupancyCatPct={statsHero.occupancyCatPct}
        locale={locale}
      />

      {/* ── Zone 1 — Maintenant ── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-[#C4974A] uppercase tracking-[0.15em]">
          {labels.zoneNow}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PensionActuelleCard
            locale={locale}
            snapshot={snapshot.pension}
            labels={labels}
          />
          <AValiderCard
            locale={locale}
            snapshot={snapshot.pending}
            labels={labels}
          />
        </div>
        <AujourdhuiCard locale={locale} snapshot={snapshot.today} labels={labels} />
      </section>

      {/* ── Zone 2 — Cette semaine ── */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-[#C4974A] uppercase tracking-[0.15em]">
          {labels.zoneWeek}
        </h2>
        <Capacity7DaysChart snapshot={snapshot.capacity7d} labels={labels} />
        <UpcomingCards locale={locale} snapshot={snapshot.upcoming} labels={labels} />
        <BirthdaysCard
          locale={locale}
          birthdays={snapshot.birthdays}
          labels={labels}
        />
      </section>

      {/* ── Zone 3 — Alertes & rappels ── */}
      {(snapshot.vaccines.length > 0 ||
        snapshot.longStays.length > 0 ||
        snapshot.inactiveClients.length > 0 ||
        snapshot.criticalInvariants.length > 0) && (
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-[#C4974A] uppercase tracking-[0.15em]">
            {labels.zoneAlerts}
          </h2>
          <CriticalInvariantsCard
            locale={locale}
            hits={snapshot.criticalInvariants}
            labels={labels}
          />
          <VaccinesCard
            locale={locale}
            vaccines={snapshot.vaccines}
            labels={labels}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <LongStaysCard locale={locale} items={snapshot.longStays} labels={labels} />
            <InactiveClientsCard
              locale={locale}
              items={snapshot.inactiveClients}
              labels={labels}
            />
          </div>
        </section>
      )}

      {/* ── Footer — discreet link to financial analysis ── */}
      <footer className="pt-4 border-t border-[#F0D98A]/30 text-center">
        <Link
          href={`/${locale}/admin/billing`}
          className="text-xs text-gray-500 hover:text-[#C4974A] transition-colors"
        >
          {labels.fullFinancialAnalysis}
        </Link>
      </footer>
    </div>
  );
}
