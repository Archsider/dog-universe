'use client';

// URL-synced filters for the History view. Server component reads searchParams
// directly to fetch — this component only mutates the URL.
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, format } from 'date-fns';

type Props = {
  locale: string;
  rangeFrom: string;
  rangeTo: string;
  status: string;
  type: string;
};

export default function HistoryFilters({ locale, rangeFrom, rangeTo, status, type }: Props) {
  const fr = locale !== 'en';
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function push(next: Record<string, string | undefined>) {
    const url = new URLSearchParams(params.toString());
    url.set('view', 'history');
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === '') url.delete(k);
      else url.set(k, v);
    }
    startTransition(() => router.push(`${pathname}?${url.toString()}`));
  }

  function applyPreset(preset: 'thisMonth' | 'lastMonth' | 'quarter' | 'year') {
    const now = new Date();
    let f: Date, t: Date;
    if (preset === 'thisMonth') { f = startOfMonth(now); t = endOfMonth(now); }
    else if (preset === 'lastMonth') { const prev = subMonths(now, 1); f = startOfMonth(prev); t = endOfMonth(prev); }
    else if (preset === 'quarter') { f = startOfQuarter(now); t = endOfQuarter(now); }
    else { f = startOfYear(now); t = endOfYear(now); }
    push({ from: format(f, 'yyyy-MM-dd'), to: format(t, 'yyyy-MM-dd') });
  }

  const typeChips: { id: string; label: string }[] = [
    { id: '', label: fr ? 'Tous' : 'All' },
    { id: 'BOARDING', label: fr ? 'Pension' : 'Boarding' },
    { id: 'PET_TAXI', label: 'Taxi' },
    { id: 'WALKIN', label: 'Walk-in' },
  ];
  const statusChips: { id: string; label: string }[] = [
    { id: '', label: fr ? 'Tous' : 'All' },
    { id: 'COMPLETED', label: fr ? 'Terminée' : 'Completed' },
    { id: 'CANCELLED', label: fr ? 'Annulée' : 'Cancelled' },
    { id: 'REJECTED', label: fr ? 'Refusée' : 'Rejected' },
    { id: 'NO_SHOW', label: 'No-show' },
  ];

  return (
    <div className="bg-white rounded-xl border border-ivory-200 p-4 mb-4 space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-medium text-gray-500 mr-1">{fr ? 'Période :' : 'Period:'}</span>
        <button type="button" onClick={() => applyPreset('thisMonth')} className="text-xs px-2.5 py-1 rounded-full bg-ivory-100 hover:bg-ivory-200">
          {fr ? 'Mois en cours' : 'This month'}
        </button>
        <button type="button" onClick={() => applyPreset('lastMonth')} className="text-xs px-2.5 py-1 rounded-full bg-ivory-100 hover:bg-ivory-200">
          {fr ? 'Mois dernier' : 'Last month'}
        </button>
        <button type="button" onClick={() => applyPreset('quarter')} className="text-xs px-2.5 py-1 rounded-full bg-ivory-100 hover:bg-ivory-200">
          {fr ? 'Trimestre' : 'Quarter'}
        </button>
        <button type="button" onClick={() => applyPreset('year')} className="text-xs px-2.5 py-1 rounded-full bg-ivory-100 hover:bg-ivory-200">
          {fr ? 'Année' : 'Year'}
        </button>
        <input
          type="date"
          value={rangeFrom}
          onChange={(e) => push({ from: e.target.value || undefined })}
          className="text-xs border border-ivory-200 rounded-md px-2 py-1"
        />
        <span className="text-xs text-gray-400">→</span>
        <input
          type="date"
          value={rangeTo}
          onChange={(e) => push({ to: e.target.value || undefined })}
          className="text-xs border border-ivory-200 rounded-md px-2 py-1"
        />
        <a
          href={`/api/admin/invoices/export?from=${rangeFrom}&to=${rangeTo}`}
          className="ml-auto text-xs px-3 py-1.5 rounded-md border border-ivory-200 hover:bg-ivory-50 text-charcoal font-medium"
        >
          {fr ? 'Exporter CSV' : 'Export CSV'}
        </a>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs font-medium text-gray-500 mr-1 self-center">{fr ? 'Type :' : 'Type:'}</span>
        {typeChips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => push({ type: c.id || undefined })}
            className={`text-xs px-2.5 py-1 rounded-full ${type === c.id ? 'bg-charcoal text-white' : 'bg-ivory-100 hover:bg-ivory-200 text-gray-700'}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs font-medium text-gray-500 mr-1 self-center">{fr ? 'Statut :' : 'Status:'}</span>
        {statusChips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => push({ status: c.id || undefined })}
            className={`text-xs px-2.5 py-1 rounded-full ${status === c.id ? 'bg-charcoal text-white' : 'bg-ivory-100 hover:bg-ivory-200 text-gray-700'}`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
