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
        <main className="relative flex-1 p-4 lg:p-8 bg-[#FEFCF9] min-h-screen">
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/zellige-pattern.png"
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover opacity-[0.08]"
              style={{ mixBlendMode: 'multiply' }}
            />
          </div>
          <div className="relative z-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
