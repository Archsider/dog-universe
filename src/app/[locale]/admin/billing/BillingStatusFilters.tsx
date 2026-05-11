import Link from 'next/link';
import type { BuildQSFn } from './billing-utils';

interface BillingStatusFiltersProps {
  locale: string;
  status: string;
  buildQS: BuildQSFn;
}

export function BillingStatusFilters({ locale, status, buildQS }: BillingStatusFiltersProps) {
  const isFr = locale === 'fr';

  const statusFilters = [
    { value: '',               label: isFr ? 'Toutes' : 'All' },
    { value: 'PAID',           label: isFr ? 'Payées' : 'Paid' },
    { value: 'PARTIALLY_PAID', label: isFr ? 'Partiel' : 'Partial' },
    { value: 'PENDING',        label: isFr ? 'En attente' : 'Pending' },
    { value: 'CANCELLED',      label: isFr ? 'Annulées' : 'Cancelled' },
  ];

  return (
    <div className="flex gap-2 flex-wrap">
      {statusFilters.map(f => {
        const active = status === f.value;
        return (
          <Link key={f.value} href={buildQS({ status: f.value || null, page: null })}>
            <button
              type="button"
              className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                active
                  ? 'bg-[#C4974A] text-white border border-[#C4974A] shadow-sm'
                  : 'bg-white text-[#8A7E75] border border-[rgba(196,151,74,0.3)] hover:border-[#C4974A] hover:text-[#C4974A]'
              }`}
            >
              {f.label}
            </button>
          </Link>
        );
      })}
    </div>
  );
}
