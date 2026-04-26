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
  Menu,
  X,
  Gift,
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
    { href: `/${locale}/client/history`, label: t('bookings'), icon: Calendar },
    { href: `/${locale}/client/invoices`, label: t('invoices'), icon: FileText },
    { href: `/${locale}/client/loyalty`, label: t('loyalty'), icon: Gift },
    { href: `/${locale}/client/notifications`, label: t('notifications'), icon: Bell },
    { href: `/${locale}/client/profile`, label: t('profile'), icon: User },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo — typographique premium + image en-dessous */}
      <div className="px-6 py-5 border-b border-[rgba(196,151,74,0.15)] text-center">
        <Link href={`/${locale}/client/dashboard`} className="block">
          <div className="font-serif text-lg font-semibold text-[#1C1612] leading-tight">
            Dog <span className="text-[#C4974A]">Universe</span>
          </div>
          <Image src="/logo.png" alt="Dog Universe" width={140} height={50} className="object-contain mt-2 mx-auto" priority />
        </Link>
      </div>

      {/* User info */}
      <div className="px-6 py-4 border-b border-[rgba(196,151,74,0.12)]">
        <p className="text-[10px] uppercase tracking-[1.5px] text-[#8A7E75]">{t('connectedAs')}</p>
        <p className="text-sm font-semibold text-[#1C1612] truncate mt-1">{userName}</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href) ||
            (item.href.includes('/history') && pathname.includes('/bookings'));
          const Icon = item.icon;
          const isNotifications = item.href.includes('/notifications');

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-[rgba(196,151,74,0.1)] text-[#C4974A] border-l-2 border-[#C4974A]'
                  : 'text-[#7A6E65] border-l-2 border-transparent hover:bg-[rgba(196,151,74,0.06)] hover:text-[#1C1612]'
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {isNotifications && unreadCount > 0 && (
                <span className="flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-[#C4974A] text-white text-xs font-bold">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Skyline Marrakech — fond sombre pour faire ressortir le doré Gemini */}
      <div className="px-3 pb-2 mt-2">
        <div
          className="relative h-28 rounded-xl overflow-hidden bg-[#1C1208]"
          style={{ boxShadow: 'inset 0 -2px 8px rgba(196,151,74,0.2)' }}
        >
          <p className="absolute top-2 left-3 text-[8px] tracking-[2px] uppercase text-[#C4974A]/80 z-10">
            Marrakech
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/marrakech-skyline.png"
            alt="Skyline Marrakech"
            className="absolute bottom-0 left-0 w-full h-full object-contain object-bottom"
          />
        </div>
      </div>

      {/* Logout */}
      <div className="px-3 pb-4 pt-2 border-t border-[rgba(196,151,74,0.12)]">
        <button
          onClick={() => signOut({ callbackUrl: `/${locale}/auth/login` })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#7A6E65] hover:text-red-600 hover:bg-red-50 transition-colors w-full"
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
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-sm border border-[rgba(196,151,74,0.2)]"
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
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-[rgba(196,151,74,0.15)] min-h-screen flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      <aside
        className={cn(
          'lg:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-72 bg-white border-r border-[rgba(196,151,74,0.15)] transform transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SidebarContent />
      </aside>
    </>
  );
}
