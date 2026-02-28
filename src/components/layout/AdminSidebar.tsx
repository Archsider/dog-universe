'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard,
  Users,
  PawPrint,
  Calendar,
  Receipt,
  BarChart3,
  ScrollText,
  ClipboardList,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Settings,
  UserCircle,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function AdminSidebar({ pendingCount = 0 }: { pendingCount?: number }) {
  const t = useTranslations('nav.admin');
  const locale = useLocale();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: NavItem[] = [
    { href: `/${locale}/admin/dashboard`, labelKey: 'dashboard', icon: LayoutDashboard },
    { href: `/${locale}/admin/clients`, labelKey: 'clients', icon: Users },
    { href: `/${locale}/admin/animals`, labelKey: 'animals', icon: PawPrint },
    { href: `/${locale}/admin/calendar`, labelKey: 'calendar', icon: Calendar },
    { href: `/${locale}/admin/reservations`, labelKey: 'reservations', icon: ClipboardList },
    { href: `/${locale}/admin/billing`, labelKey: 'billing', icon: Receipt },
    { href: `/${locale}/admin/analytics`, labelKey: 'analytics', icon: BarChart3 },
    { href: `/${locale}/admin/logs`, labelKey: 'logs', icon: ScrollText },
    { href: `/${locale}/admin/settings`, labelKey: 'settings', icon: Settings },
    { href: `/${locale}/admin/profile`, labelKey: 'profile', icon: UserCircle },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-[#F0D98A]/30">
        <Link href={`/${locale}/admin/dashboard`} className="block">
          <Image src="/logo.png" alt="Dog Universe" width={140} height={50} className="object-contain" priority />
          <div className="flex items-center gap-1.5 mt-1">
            <ShieldCheck className="h-3 w-3 text-gold-500" />
            <p className="text-xs text-gold-600 font-medium">Administration</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          const isReservations = item.href.includes('/reservations');

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
              <span className="flex-1">{t(item.labelKey as Parameters<typeof t>[0])}</span>
              {isReservations && pendingCount > 0 && (
                <span className="flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-amber-500 text-white text-xs font-bold">
                  {pendingCount > 99 ? '99+' : pendingCount}
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
          <span>Déconnexion</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-md shadow-card border border-[#F0D98A]/30"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-[#F0D98A]/30 min-h-screen flex-shrink-0">
        <SidebarContent />
      </aside>

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
