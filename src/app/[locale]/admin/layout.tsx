import { redirect } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { AdminNotificationBell } from '@/components/layout/AdminNotificationBell';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { SessionWatcher } from '@/components/shared/SessionWatcher';
import CommandPalette from '@/components/admin/CommandPalette';
import QuickActionsBar from '@/components/admin/QuickActionsBar';
import HeaderSearchButton from '@/components/admin/HeaderSearchButton';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { getCachedAuth } from '@/lib/cached-auth';

// Global counts (same value for every admin) — wrapped in unstable_cache
// with a shared tag so any booking/claim mutation can invalidate via
// revalidateTag('admin-counts'). Per-admin counts (addon requests) stay
// uncached: they're userId-scoped and the (userId, read) index keeps them
// cheap.
const getGlobalAdminCounts = unstable_cache(
  async () => {
    const [pendingCount, pendingClaimsCount, catalogSuggestionsCount] = await Promise.all([
      prisma.booking.count({ where: notDeleted({ status: 'PENDING' }) }),
      prisma.loyaltyBenefitClaim.count({ where: { status: 'PENDING' } }),
      prisma.productCatalogSuggestion.count({ where: { status: 'pending' } }),
    ]);
    return { pendingCount, pendingClaimsCount, catalogSuggestionsCount };
  },
  ['admin-global-counts'],
  { tags: ['admin-counts'], revalidate: 30 },
);

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AdminLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  // getCachedAuth wraps auth() with React.cache() — child admin pages can
  // re-import the same helper and reuse the resolved session for free
  // within the same RSC render. See src/lib/cached-auth.ts.
  const session = await getCachedAuth();
  if (!session?.user) redirect(`/${locale}/auth/login`);
  if ((session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) redirect(`/${locale}/client/dashboard`);

  const [globalCounts, addonRequestCount] = await Promise.all([
    getGlobalAdminCounts(),
    prisma.notification.count({
      where: { userId: session.user.id, type: 'ADDON_REQUEST', read: false },
    }),
  ]);
  const { pendingCount, pendingClaimsCount, catalogSuggestionsCount } = globalCounts;

  return (
    <div className="min-h-screen bg-ivory-50 flex">
      <AdminSidebar pendingCount={pendingCount} pendingClaimsCount={pendingClaimsCount} addonRequestCount={addonRequestCount} catalogSuggestionsCount={catalogSuggestionsCount} userRole={session.user.role} />
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-ivory-200">
          <div className="h-16 flex items-center justify-between gap-2 px-4 lg:px-6">
            <div className="lg:hidden w-8" />
            {/* Search bar — visible icon on mobile + full pill on desktop.
                Wave 7.3 — user feedback 'pas de recherche visible sur mobile'.
                The component handles mobile vs desktop layout internally. */}
            <HeaderSearchButton locale={locale} />
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-xs text-gray-500 mr-2 hidden sm:block">Admin</span>
              <AdminNotificationBell />
              <LanguageSwitcher />
            </div>
          </div>
          {/* Wave 6 Feature #3 — Quick Actions Bar.
              pl-14 sur mobile pour laisser de la place au bouton hamburger
              fixed top-4 left-4 (AdminSidebar) qui sinon recouvre la 1ère
              action — bug audit screenshot 2026-05-21. */}
          <div className="border-t border-ivory-200 bg-[#FEFCF9] pl-14 pr-4 lg:px-6">
            <QuickActionsBar locale={locale} />
          </div>
        </header>
        <main className="relative flex-1 p-4 lg:p-8 bg-[#FEFCF9] min-h-screen">
          {/* Zellige discret — classe CSS (pas inline style : banni par style-src-attr none CSP) */}
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none zellige-bg" />
          <SessionWatcher loginPath={`/${locale}/auth/login`} />
          {/* Wave 6 Feature #2 — Cmd+K universal search */}
          <CommandPalette locale={locale} />
          <div className="relative z-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
