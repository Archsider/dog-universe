// Tab navigation for /admin/driver. Two views on the same path so the
// operator has "Mode chauffeur" (live) and "Historique" (past) side by
// side. Driven by `?view=` URL state so each tab is bookmarkable and
// the back button works naturally.

import Link from 'next/link';
import { Car, Clock } from 'lucide-react';

type View = 'live' | 'history';

interface Props {
  locale: string;
  view: View;
}

export function DriverTabs({ locale, view }: Props) {
  const isFr = locale !== 'en';
  const tabs: { id: View; label: string; icon: typeof Car }[] = [
    { id: 'live', label: isFr ? 'Mode chauffeur' : 'Driver mode', icon: Car },
    { id: 'history', label: isFr ? 'Historique' : 'History', icon: Clock },
  ];

  return (
    <nav
      role="tablist"
      aria-label={isFr ? 'Vues du tableau de bord chauffeur' : 'Driver dashboard views'}
      className="flex border-b border-[rgba(196,151,74,0.2)]"
    >
      {tabs.map(({ id, label, icon: Icon }) => {
        const isActive = view === id;
        const href = id === 'live' ? `/${locale}/admin/driver` : `/${locale}/admin/driver?view=${id}`;
        return (
          <Link
            key={id}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={
              isActive
                ? 'flex items-center gap-2 px-4 py-2 text-sm font-medium text-charcoal border-b-2 border-[#C4974A] -mb-px'
                : 'flex items-center gap-2 px-4 py-2 text-sm text-charcoal/60 hover:text-charcoal transition-colors'
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
