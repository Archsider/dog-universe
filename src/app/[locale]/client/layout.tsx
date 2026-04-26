import { redirect } from 'next/navigation';
import Link from 'next/link';
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
      <div className="flex min-h-screen bg-[#FEFCF9]">
        <ClientSidebar userName={session.user.name} unreadCount={unreadCount} />

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <header className="bg-[#FEFCF9]/95 backdrop-blur-sm border-b border-[rgba(196,151,74,0.15)] h-14 flex items-center justify-between px-4 sm:px-6 gap-3 flex-shrink-0 lg:sticky lg:top-0 lg:z-30">
            <Link href={`/${locale}/client/dashboard`} className="font-serif text-lg font-semibold text-[#1C1612] hidden lg:block">
              Dog <span className="text-[#C4974A]">Universe</span>
            </Link>
            <div className="flex items-center gap-3 ml-auto">
              <NotificationBell />
              <LanguageSwitcher />
            </div>
          </header>

          {/* Page content — zellige Gemini transparent en overlay (multiply 8%) */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 animate-fade-in relative">
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
    </ContractGate>
  );
}
