// Server component — tab navigation for /admin/reservations.
// 4 horizons: today | upcoming | in-progress | history. Default = today.
// The display toggle (Board/List) lives separately on each view.
import Link from 'next/link';

export type ViewTab = 'today' | 'upcoming' | 'in-progress' | 'history';

type Props = {
  current: ViewTab;
  locale: string;
  badges: { today: number; upcoming: number; inProgress: number };
};

export default function TabBar({ current, locale, badges }: Props) {
  const fr = locale !== 'en';
  const tabs: { id: ViewTab; label: string; count?: number }[] = [
    { id: 'today', label: fr ? "Aujourd'hui" : 'Today', count: badges.today },
    { id: 'upcoming', label: fr ? 'À venir' : 'Upcoming', count: badges.upcoming },
    { id: 'in-progress', label: fr ? 'En cours' : 'In progress', count: badges.inProgress },
    { id: 'history', label: fr ? 'Historique' : 'History' },
  ];

  return (
    <nav className="border-b border-ivory-200 mb-6 flex gap-1 overflow-x-auto">
      {tabs.map((t) => {
        const active = t.id === current;
        const showBadge = t.count != null && t.count > 0;
        return (
          <Link
            key={t.id}
            href={`/${locale}/admin/reservations?view=${t.id}`}
            className={[
              'relative px-4 py-2.5 text-sm whitespace-nowrap transition-colors border-b-2 -mb-px',
              active
                ? 'border-charcoal text-charcoal font-medium'
                : 'border-transparent text-gray-500 hover:text-charcoal',
            ].join(' ')}
          >
            {t.label}
            {showBadge && (
              <span
                className={`ml-1.5 text-[10px] rounded-full px-1.5 py-0.5 font-medium ${
                  active ? 'bg-charcoal text-white' : 'bg-ivory-100 text-gray-600'
                }`}
              >
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
