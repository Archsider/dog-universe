import Link from 'next/link';
import { Receipt, FileWarning, ChevronRight } from 'lucide-react';

export type KpiListItem = {
  id: string;
  href: string;
  primary: string;       // ex: "Karim Hihi"
  secondary?: string;    // ex: "Jack"
  tertiary?: string;     // ex: "13 mai"
  quaternary?: string;   // ex: "850 MAD"
};

type Severity = 'neutral' | 'warning';
type Variant = 'unbilled' | 'pending-invoices';

type Props = {
  title: string;
  count: number;
  /** Optional second line in the header (ex: total amount summary). */
  totalSummary?: string;
  items: KpiListItem[];
  /** Link target for the "View all" footer link. */
  viewAllHref: string;
  viewAllLabel: string;
  emptyMessage: string;
  severity: Severity;
  variant: Variant;
};

const SEVERITY_STYLES: Record<Severity, {
  card: string;
  iconBg: string;
  iconColor: string;
  numberColor: string;
  badge: string;
}> = {
  neutral: {
    card: 'bg-white border-emerald-200/60',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
    numberColor: 'text-emerald-700',
    badge: 'text-emerald-600',
  },
  warning: {
    card: 'bg-white border-amber-200/70',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    numberColor: 'text-charcoal',
    badge: 'text-amber-700',
  },
};

export default function DashboardKpiList({
  title, count, totalSummary, items, viewAllHref, viewAllLabel, emptyMessage, severity, variant,
}: Props) {
  const styles = SEVERITY_STYLES[severity];
  const Icon = variant === 'pending-invoices' ? Receipt : FileWarning;

  return (
    <div className={`rounded-xl border p-4 shadow-card ${styles.card}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${styles.iconBg}`}>
          <Icon className={`h-5 w-5 ${styles.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-medium text-charcoal truncate">{title}</span>
            <span className={`text-base font-bold ${styles.badge}`}>({count})</span>
          </div>
          {totalSummary && (
            <div className="text-xs text-gray-500 mt-0.5">{totalSummary}</div>
          )}
        </div>
      </div>

      {count === 0 ? (
        <div className="text-xs text-emerald-700 bg-emerald-50/60 rounded-md px-3 py-2 flex items-center gap-1.5">
          <span aria-hidden>✓</span>
          <span>{emptyMessage}</span>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-ivory-100 -mx-1">
            {items.map((it) => (
              <li key={it.id}>
                <Link
                  href={it.href}
                  className="flex items-center gap-2 px-1 py-2 hover:bg-ivory-50/80 rounded-md transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-charcoal truncate">
                      {it.primary}
                      {it.secondary && (
                        <span className="text-gray-500 font-normal"> · {it.secondary}</span>
                      )}
                    </div>
                    {(it.tertiary || it.quaternary) && (
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                        {it.tertiary && <span className="truncate">{it.tertiary}</span>}
                        {it.quaternary && (
                          <span className="font-medium text-charcoal/80 flex-shrink-0">{it.quaternary}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
          {count > items.length && (
            <Link
              href={viewAllHref}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-charcoal/80 hover:text-charcoal"
            >
              {viewAllLabel} ({count}) <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </>
      )}
    </div>
  );
}
