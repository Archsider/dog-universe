import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';

interface LayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

export default async function AdminLayout({ children, params: { locale } }: LayoutProps) {
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);
  if (session.user.role !== 'ADMIN') redirect(`/${locale}/client/dashboard`);

  return (
    <div className="min-h-screen bg-ivory-50 flex">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-ivory-200 flex items-center justify-between px-4 lg:px-6">
          <div className="lg:hidden w-8" />
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-xs text-gray-500 mr-2 hidden sm:block">Admin</span>
            <LanguageSwitcher />
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
