import { redirect } from 'next/navigation';
import { auth } from '../../../../auth';
import { ClientSidebar } from '@/components/layout/ClientSidebar';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { NotificationBell } from '@/components/shared/NotificationBell';
import { getUnreadCount } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';
import { ContractGate } from '@/components/contract/ContractGate';

type Params = { locale: string };

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<Params>;
}) {
  const { locale } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect(`/${locale}/auth/login`);
  }

  if (session.user.role === 'ADMIN' || session.user.role === 'SUPERADMIN') {
    redirect(`/${locale}/admin/dashboard`);
  }

  const [unreadCount, contract] = await Promise.all([
    getUnreadCount(session.user.id),
    prisma.clientContract.findUnique({
      where: { clientId: session.user.id },
      select: { id: true },
    }),
  ]);

  const hasContract = !!contract;

  return (
    <ContractGate hasContract={hasContract} clientName={session.user.name ?? ''}>
      <div className="flex min-h-screen bg-[#FAF6F0]">
        <ClientSidebar userName={session.user.name} unreadCount={unreadCount} />

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <header className="bg-white border-b border-[#F0D98A]/30 h-14 flex items-center justify-end px-4 sm:px-6 gap-3 flex-shrink-0 lg:sticky lg:top-0 lg:z-30">
            <NotificationBell />
            <LanguageSwitcher />
          </header>

          {/* Page content */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 animate-fade-in">
            {children}
          </main>
        </div>
      </div>
    </ContractGate>
  );
}
