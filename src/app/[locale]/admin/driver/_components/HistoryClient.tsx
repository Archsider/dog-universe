'use client';

// Client-side renderer for the Historique tab. Owns the filter state, syncs
// it to URL search params so the view is bookmarkable, and fetches via
// /api/admin/taxi-trips/history with cursor pagination.

import { useEffect, useState, useCallback, useTransition } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Download, ChevronLeft, ChevronRight, MapPin, X } from 'lucide-react';

type TripType = 'OUTBOUND' | 'RETURN' | 'STANDALONE';
type HistoryStatus =
  | 'ARRIVED_AT_PENSION'
  | 'ARRIVED_AT_CLIENT'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'NO_SHOW';

interface Row {
  id: string;
  bookingId: string;
  date: string | null;
  time: string | null;
  type: TripType;
  status: string;
  distanceKm: number;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  clientName: string | null;
  petNames: string[];
}

interface Page {
  rows: Row[];
  nextCursor: string | null;
  totalCount: number;
}

interface Props {
  locale: string;
}

const TYPE_LABELS_FR: Record<TripType, string> = {
  OUTBOUND: 'Aller',
  RETURN: 'Retour',
  STANDALONE: 'Direct',
};
const TYPE_LABELS_EN: Record<TripType, string> = {
  OUTBOUND: 'Outbound',
  RETURN: 'Return',
  STANDALONE: 'Direct',
};

const STATUS_LABELS_FR: Record<string, string> = {
  ARRIVED_AT_PENSION: 'Arrivé pension',
  ARRIVED_AT_CLIENT: 'Arrivé client',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
  REJECTED: 'Refusée',
  NO_SHOW: 'No-show',
};
const STATUS_LABELS_EN: Record<string, string> = {
  ARRIVED_AT_PENSION: 'At pension',
  ARRIVED_AT_CLIENT: 'At client',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
  NO_SHOW: 'No-show',
};

function buildQueryString(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) sp.set(key, value);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function HistoryClient({ locale }: Props) {
  const isFr = locale !== 'en';
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Filter state mirrored from URL on every render so back/forward and
  // bookmark links work without local state desync.
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const type = (searchParams.get('type') ?? '') as TripType | '';
  const status = (searchParams.get('status') ?? '') as HistoryStatus | '';
  const cursor = searchParams.get('cursor') ?? undefined;

  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const fetchPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({
        from: from || undefined,
        to: to || undefined,
        type: type || undefined,
        status: status || undefined,
        cursor,
        pageSize: '20',
      });
      const res = await fetch(`/api/admin/taxi-trips/history${qs}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as Page;
      setPage(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, type, status, cursor]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  // URL sync helper — keeps `?view=history` baseline, drops cursor on filter
  // change so the user always lands on page 1 of the new filter set.
  function updateFilters(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    next.set('view', 'history');
    next.delete('cursor');
    for (const [key, value] of Object.entries(patch)) {
      if (value === '' || value === undefined) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  function goToNextPage() {
    if (!page?.nextCursor) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set('view', 'history');
    next.set('cursor', page.nextCursor);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  function resetCursor() {
    const next = new URLSearchParams(searchParams.toString());
    next.set('view', 'history');
    next.delete('cursor');
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  const exportHref = `/api/admin/taxi-trips/history/export${buildQueryString({
    from: from || undefined,
    to: to || undefined,
    type: type || undefined,
    status: status || undefined,
  })}`;

  const types: TripType[] = ['OUTBOUND', 'RETURN', 'STANDALONE'];
  const statuses: HistoryStatus[] = [
    'ARRIVED_AT_PENSION',
    'ARRIVED_AT_CLIENT',
    'COMPLETED',
    'CANCELLED',
    'REJECTED',
    'NO_SHOW',
  ];
  const TYPE_LABELS = isFr ? TYPE_LABELS_FR : TYPE_LABELS_EN;
  const STATUS_LABELS = isFr ? STATUS_LABELS_FR : STATUS_LABELS_EN;

  const hasFilters = Boolean(from || to || type || status);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <section
        className="bg-white rounded-xl border border-[rgba(196,151,74,0.2)] p-4"
        aria-label={isFr ? 'Filtres' : 'Filters'}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-charcoal/60">{isFr ? 'Du' : 'From'}</span>
            <input
              type="date"
              value={from}
              onChange={(e) => updateFilters({ from: e.target.value })}
              className="border border-[rgba(196,151,74,0.3)] rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-charcoal/60">{isFr ? 'Au' : 'To'}</span>
            <input
              type="date"
              value={to}
              onChange={(e) => updateFilters({ to: e.target.value })}
              className="border border-[rgba(196,151,74,0.3)] rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-charcoal/60">{isFr ? 'Type' : 'Type'}</span>
            <select
              value={type}
              onChange={(e) => updateFilters({ type: e.target.value })}
              className="border border-[rgba(196,151,74,0.3)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="">{isFr ? 'Tous' : 'All'}</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-charcoal/60">{isFr ? 'Statut' : 'Status'}</span>
            <select
              value={status}
              onChange={(e) => updateFilters({ status: e.target.value })}
              className="border border-[rgba(196,151,74,0.3)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="">{isFr ? 'Tous' : 'All'}</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center justify-between gap-3 mt-3">
          <div className="text-xs text-charcoal/60">
            {page
              ? isFr
                ? `${page.totalCount} course${page.totalCount > 1 ? 's' : ''} au total`
                : `${page.totalCount} trip${page.totalCount > 1 ? 's' : ''} total`
              : ''}
          </div>
          <div className="flex items-center gap-2">
            {hasFilters && (
              <button
                type="button"
                onClick={() => updateFilters({ from: '', to: '', type: '', status: '' })}
                className="text-xs text-charcoal/60 hover:text-charcoal flex items-center gap-1"
              >
                <X className="h-3 w-3" />
                {isFr ? 'Réinitialiser' : 'Clear'}
              </button>
            )}
            <a
              href={exportHref}
              className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#C4974A] text-[#C4974A] hover:bg-[#C4974A] hover:text-white transition-colors"
            >
              <Download className="h-3 w-3" />
              {isFr ? 'Export CSV' : 'Export CSV'}
            </a>
          </div>
        </div>
      </section>

      {/* Table */}
      <section
        className="bg-white rounded-xl border border-[rgba(196,151,74,0.2)] overflow-hidden"
        aria-label={isFr ? 'Historique des courses' : 'Trip history'}
      >
        {loading && !page ? (
          <div className="p-8 text-center text-sm text-charcoal/60">
            {isFr ? 'Chargement…' : 'Loading…'}
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-600">
            {isFr ? `Erreur : ${error}` : `Error: ${error}`}
          </div>
        ) : !page || page.rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-charcoal/60">
            {isFr ? 'Aucune course ne correspond à ces filtres.' : 'No trips match these filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ivory-50 text-xs text-charcoal/60 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2">{isFr ? 'Date' : 'Date'}</th>
                  <th className="text-left px-4 py-2">{isFr ? 'Heure' : 'Time'}</th>
                  <th className="text-left px-4 py-2">{isFr ? 'Type' : 'Type'}</th>
                  <th className="text-left px-4 py-2">{isFr ? 'Statut' : 'Status'}</th>
                  <th className="text-left px-4 py-2">{isFr ? 'Client' : 'Client'}</th>
                  <th className="text-left px-4 py-2">{isFr ? 'Animaux' : 'Pets'}</th>
                  <th className="text-right px-4 py-2">{isFr ? 'Distance' : 'Distance'}</th>
                  <th className="text-left px-4 py-2">{isFr ? 'Adresse' : 'Address'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(196,151,74,0.1)]">
                {page.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-ivory-50/50">
                    <td className="px-4 py-2">
                      <Link
                        href={`/${locale}/admin/reservations/${r.bookingId}`}
                        className="text-charcoal hover:text-[#C4974A]"
                      >
                        {r.date ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-charcoal/70">{r.time ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className="inline-block text-[10px] uppercase tracking-wider text-charcoal/60 bg-ivory-100 rounded px-1.5 py-0.5">
                        {TYPE_LABELS[r.type]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-charcoal/70">{STATUS_LABELS[r.status] ?? r.status}</td>
                    <td className="px-4 py-2 text-charcoal">{r.clientName ?? '—'}</td>
                    <td className="px-4 py-2 text-charcoal/70 text-xs">{r.petNames.join(', ') || '—'}</td>
                    <td className="px-4 py-2 text-right text-charcoal/70">{r.distanceKm.toFixed(1)} km</td>
                    <td className="px-4 py-2 text-xs text-charcoal/60 max-w-[280px] truncate">
                      {r.pickupAddress ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          {r.pickupAddress}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination — cursor-based : we expose Prev (= reset to page 1) and
            Next only. Going back N pages by URL would need a stack of cursors;
            for an internal SaaS at 1-5 trips/day, "reset + scroll forward" is
            enough. */}
        {page && page.rows.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-[rgba(196,151,74,0.1)] text-xs text-charcoal/60">
            <button
              type="button"
              onClick={resetCursor}
              disabled={!cursor}
              className="flex items-center gap-1 disabled:opacity-30"
            >
              <ChevronLeft className="h-3 w-3" />
              {isFr ? 'Première page' : 'First page'}
            </button>
            <button
              type="button"
              onClick={goToNextPage}
              disabled={!page.nextCursor}
              className="flex items-center gap-1 disabled:opacity-30"
            >
              {isFr ? 'Page suivante' : 'Next page'}
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
