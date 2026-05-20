'use client';

// Quick Actions Bar — sticky header strip with 4 always-visible CTAs.
// Saves the founder a couple of clicks per workflow ; deep-links straight
// into the most-used flows.  Visible on every /admin/* page.
//
// Source : Wave 6 (Admin classe mondiale, Feature #3).

import Link from 'next/link';
import { CalendarPlus, ShoppingBag, Wallet, MessageSquarePlus, Command } from 'lucide-react';

interface Props {
  locale: string;
}

export default function QuickActionsBar({ locale }: Props) {
  const fr = locale === 'fr';
  const ar = locale === 'ar';

  const actions = [
    {
      href: `/${locale}/admin/reservations/new`,
      label: fr ? 'Nouvelle résa' : ar ? 'حجز جديد' : 'New booking',
      icon: CalendarPlus,
      tone: 'gold',
    },
    {
      // Auto-opens the WalkinInvoiceModal on /admin/billing via the
      // ?walkin=open searchParam (see WalkinInvoiceModal.tsx useEffect).
      href: `/${locale}/admin/billing?walkin=open`,
      label: fr ? 'Walk-in' : 'Walk-in',
      icon: ShoppingBag,
      tone: 'emerald',
    },
    {
      // Lands on the billing dashboard with the unpaid filter focused so
      // the operator can immediately pick which invoice to settle.
      href: `/${locale}/admin/billing?status=PENDING`,
      label: fr ? 'Encaisser' : ar ? 'تحصيل' : 'Collect',
      icon: Wallet,
      tone: 'blue',
    },
    {
      href: `/${locale}/admin/clients`,
      label: fr ? 'Clients' : ar ? 'العملاء' : 'Clients',
      icon: MessageSquarePlus,
      tone: 'gray',
    },
  ];

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto py-2 -mx-4 px-4 lg:mx-0 lg:px-0"
      style={{ scrollbarWidth: 'thin' }}
    >
      {actions.map((a, i) => {
        const Icon = a.icon;
        const cls =
          a.tone === 'gold'
            ? 'border-[#C4974A]/50 bg-[#FFF9E8] text-[#8B6914] hover:bg-[#C4974A] hover:text-white'
            : a.tone === 'emerald'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white'
              : a.tone === 'blue'
                ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white'
                : 'border-gray-200 bg-gray-50 text-charcoal/70 hover:bg-charcoal hover:text-white';
        return (
          <Link
            key={i}
            href={a.href}
            className={`shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold border transition-all ${cls}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {a.label}
          </Link>
        );
      })}
      <div className="hidden sm:flex items-center gap-1.5 ml-auto text-[10px] text-charcoal/40 shrink-0">
        <Command className="h-3 w-3" />
        <kbd className="px-1 py-0.5 rounded border border-gray-200 font-mono">⌘K</kbd>
        <span>{fr ? 'recherche' : ar ? 'بحث' : 'search'}</span>
      </div>
    </div>
  );
}
