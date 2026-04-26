import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { AdminNotificationBell } from '@/components/layout/AdminNotificationBell';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { prisma } from '@/lib/prisma';

interface LayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

export default async function AdminLayout({ children, params: { locale } }: LayoutProps) {
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);
  if ((session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) redirect(`/${locale}/client/dashboard`);

  const [pendingCount, pendingClaimsCount] = await Promise.all([
    prisma.booking.count({ where: { status: 'PENDING' } }),
    prisma.loyaltyBenefitClaim.count({ where: { status: 'PENDING' } }),
  ]);

  return (
    <div className="min-h-screen bg-ivory-50 flex">
      <AdminSidebar pendingCount={pendingCount} pendingClaimsCount={pendingClaimsCount} userRole={session.user.role} />
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
        <main
          className="flex-1 p-4 lg:p-8 bg-[#FEFCF9] min-h-screen"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23FEFCF9'/%3E%3Cpolygon points='40,8 44,28 58,18 50,34 68,36 54,44 62,58 48,52 44,72 38,52 24,60 30,44 12,38 28,32 20,18 36,28' fill='none' stroke='%23C4974A' stroke-width='1' opacity='0.12'/%3E%3Crect x='32' y='32' width='16' height='16' fill='%23F5E8CC' stroke='%23C4974A' stroke-width='0.8' opacity='0.15' transform='rotate(45 40 40)'/%3E%3Cline x1='40' y1='0' x2='40' y2='80' stroke='%23C4974A' stroke-width='0.4' opacity='0.06'/%3E%3Cline x1='0' y1='40' x2='80' y2='40' stroke='%23C4974A' stroke-width='0.4' opacity='0.06'/%3E%3C/svg%3E\")",
            backgroundSize: '80px 80px',
            backgroundRepeat: 'repeat',
            backgroundAttachment: 'local',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
