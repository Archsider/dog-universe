'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard,
  PawPrint,
  Calendar,
  FileText,
  Bell,
  User,
  LogOut,
  History,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface ClientSidebarProps {
  userName: string;
  unreadCount?: number;
}

export function ClientSidebar({ userName, unreadCount = 0 }: ClientSidebarProps) {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: NavItem[] = [
    { href: `/${locale}/client/dashboard`, label: t('dashboard'), icon: LayoutDashboard },
    { href: `/${locale}/client/pets`, label: t('pets'), icon: PawPrint },
    { href: `/${locale}/client/bookings/new`, label: t('bookings'), icon: Calendar },
    { href: `/${locale}/client/history`, label: t('history'), icon: History },
    { href: `/${locale}/client/invoices`, label: t('invoices'), icon: FileText },
    { href: `/${locale}/client/notifications`, label: t('notifications'), icon: Bell },
    { href: `/${locale}/client/profile`, label: t('profile'), icon: User },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-[#F0D98A]/30">
        <Link href={`/${locale}/client/dashboard`} className="block">
          <Image src="/logo.png" alt="Dog Universe" width={140} height={50} className="object-contain" priority />
        </Link>
      </div>

      {/* User info */}
      <div className="px-6 py-4 border-b border-[#F0D98A]/20">
        <p className="text-xs text-muted-foreground">Connecté en tant que</p>
        <p className="text-sm font-semibold text-charcoal truncate mt-0.5">{userName}</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href) ||
            (item.href.includes('/bookings/new') && pathname.includes('/bookings'));
          const Icon = item.icon;
          const isNotifications = item.href.includes('/notifications');

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-gold-50 text-gold-700 border border-gold-200'
                  : 'text-charcoal/70 hover:text-charcoal hover:bg-[#FAF6F0]'
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {isNotifications && unreadCount > 0 && (
                <span className="flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-gold-500 text-white text-xs font-bold">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 pb-4 pt-2 border-t border-[#F0D98A]/20">
        <button
          onClick={() => signOut({ callbackUrl: `/${locale}/auth/login` })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-charcoal/70 hover:text-red-600 hover:bg-red-50 transition-colors w-full"
        >
          <LogOut className="h-4 w-4" />
          <span>{t('logout')}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-md shadow-card border border-[#F0D98A]/30"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-[#F0D98A]/30 min-h-screen flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      <aside
        className={cn(
          'lg:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-72 bg-white border-r border-[#F0D98A]/30 transform transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SidebarContent />
      </aside>
    </>
  );
}
