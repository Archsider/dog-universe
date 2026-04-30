import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { AdminNotificationBell } from '@/components/layout/AdminNotificationBell';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { SessionWatcher } from '@/components/shared/SessionWatcher';
import { prisma } from '@/lib/prisma';

// Global counts (same value for every admin) — wrapped in unstable_cache
// with a shared tag so any booking/claim mutation can invalidate via
// revalidateTag('admin-counts'). Per-admin counts (addon requests) stay
// uncached: they're userId-scoped and the (userId, read) index keeps them
// cheap.
const getGlobalAdminCounts = unstable_cache(
  async () => {
    const [pendingCount, pendingClaimsCount] = await Promise.all([
      prisma.booking.count({ where: { status: 'PENDING', deletedAt: null } }), // soft-delete: required — no global extension (Edge Runtime incompatible)
      prisma.loyaltyBenefitClaim.count({ where: { status: 'PENDING' } }),
    ]);
    return { pendingCount, pendingClaimsCount };
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
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);
  if ((session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) redirect(`/${locale}/client/dashboard`);

  const [globalCounts, addonRequestCount] = await Promise.all([
    getGlobalAdminCounts(),
    prisma.notification.count({
      where: { userId: session.user.id, type: 'ADDON_REQUEST', read: false },
    }),
  ]);
  const { pendingCount, pendingClaimsCount } = globalCounts;

  return (
    <div className="min-h-screen bg-ivory-50 flex">
      <AdminSidebar pendingCount={pendingCount} pendingClaimsCount={pendingClaimsCount} addonRequestCount={addonRequestCount} userRole={session.user.role} />
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-ivory-200 flex items-center justify-between px-4 lg:px-6">
          <div className="lg:hidden w-8" />
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-xs text-gray-500 mr-2 hidden sm:block">Admin</span>
            <AdminNotificationBell />
            <LanguageSwitcher />
          </div>
        </header>
        <main className="relative flex-1 p-4 lg:p-8 bg-[#FEFCF9] min-h-screen">
          <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ opacity: 0.12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/zellige-pattern.png"
              alt=""
              aria-hidden="true"
              className="w-full h-full"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <SessionWatcher loginPath={`/${locale}/auth/login`} />
          <div className="relative z-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
