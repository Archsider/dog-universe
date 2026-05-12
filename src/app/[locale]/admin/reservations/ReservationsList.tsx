'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Download, Plus, Calendar } from 'lucide-react';
import { formatMAD } from '@/lib/utils';

import { KpiCard, Pill } from './_components/ListControls';
import { Row } from './_components/ListRow';
import {
  isInProgressNow,
  isOpenEndedRow,
  buildTranslations,
  type ReservationRow,
  type Filter,
} from './_lib/list-types';

export type { ReservationRow };

type Props = {
  bookings: ReservationRow[];
  locale: string;
  monthlyRevenue: number;
  initialFilter?: Filter;
  compact?: boolean;
};

export default function ReservationsList({ bookings, locale, monthlyRevenue, initialFilter = 'ALL', compact = false }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState('');
  // Pagination client : KPIs restent calculés sur le dataset complet (chargé
  // côté serveur avec take: 500), mais on n'affiche que PAGE_SIZE lignes à la
  // fois pour réduire la charge DOM/render. Reset à 1 sur changement de filtre.
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [filter, query]);

  // Sync filter back to URL (no scroll, replace) so deep links keep working.
  useEffect(() => {
    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    if (filter === 'ALL') sp.delete('f');
    else sp.set('f', filter);
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const t = useMemo(() => buildTranslations(locale), [locale]);

  // KPIs (computed from full dataset, not filtered)
  const kpis = useMemo(() => {
    const inProgress = bookings.filter(isInProgressNow).length;
    const pending = bookings.filter(b => b.status === 'PENDING').length;
    const walkInsOpen = bookings.filter(b => isOpenEndedRow(b) && b.status !== 'COMPLETED' && b.status !== 'CANCELLED' && b.status !== 'REJECTED').length;
    return { inProgress, pending, walkInsOpen };
  }, [bookings]);

  // Apply filter + search
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookings.filter(b => {
      switch (filter) {
        case 'IN_PROGRESS':  if (!isInProgressNow(b)) return false; break;
        case 'CONFIRMED':    if (b.status !== 'CONFIRMED') return false; break;
        case 'PENDING':      if (b.status !== 'PENDING') return false; break;
        case 'WALKIN':
          if (!isOpenEndedRow(b)) return false;
          if (b.status === 'COMPLETED' || b.status === 'CANCELLED' || b.status === 'REJECTED' || b.status === 'NO_SHOW') return false;
          break;
        case 'CANCELLED':    if (b.status !== 'CANCELLED' && b.status !== 'REJECTED') return false; break;
        case 'NO_SHOW':      if (b.status !== 'NO_SHOW') return false; break;
        case 'BOARDING':     if (b.serviceType !== 'BOARDING') return false; break;
        case 'PET_TAXI':     if (b.serviceType !== 'PET_TAXI') return false; break;
        default: break;
      }
      if (q) {
        const fullName = `${b.client.firstName} ${b.client.lastName}`.toLowerCase();
        if (!fullName.includes(q) && !b.pets.some(p => p.name.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [bookings, filter, query]);

  const monthName = useMemo(() => {
    return new Date().toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' });
  }, [locale]);

  const handleExport = () => {
    const esc = (raw: string | number | null | undefined) => {
      const s = raw == null ? '' : String(raw);
      const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const headers = ['ID', 'Client', 'Phone', 'Pets', 'Status', 'Start', 'End', 'OpenEnded', 'Service', 'HasTaxi', 'Total'];
    const rows = filtered.map(b => [
      b.id, `${b.client.firstName} ${b.client.lastName}`, b.client.phone ?? '',
      b.pets.map(p => `${p.name} (${p.species})`).join(' | '),
      b.status, b.startDate.slice(0, 10), b.endDate ? b.endDate.slice(0, 10) : '',
      b.isOpenEnded ? 'true' : 'false', b.serviceType,
      b.hasTaxi ? (b.taxiReturn ? 'roundtrip' : 'oneway') : '',
      b.invoiceAmount ?? b.totalPrice,
    ]);
    const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {!compact && (
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-serif font-bold text-charcoal">{t.title}</h1>
            <p className="text-sm text-charcoal/50 mt-0.5 capitalize">
              {monthName} · {kpis.inProgress} {t.subActiveStays} · {kpis.walkInsOpen} {t.subWalkIns}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white border border-ivory-200 text-charcoal rounded-lg hover:border-gold-300 transition-colors">
              <Download className="h-3.5 w-3.5" />{t.export}
            </button>
            <Link href={`/${locale}/admin/reservations/new`}>
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gold-500 text-white rounded-lg hover:bg-gold-600 transition-colors">
                <Plus className="h-3.5 w-3.5" />{t.create}
              </button>
            </Link>
          </div>
        </div>
      )}

      {!compact && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard label={t.inProgress} value={kpis.inProgress} active={filter === 'IN_PROGRESS'} onClick={() => setFilter(filter === 'IN_PROGRESS' ? 'ALL' : 'IN_PROGRESS')} accent="#3B6D11" accentBg="#EAF3DE" />
          <KpiCard label={t.pending} value={kpis.pending} active={filter === 'PENDING'} onClick={() => setFilter(filter === 'PENDING' ? 'ALL' : 'PENDING')} accent="#854F0B" accentBg="#FAEEDA" />
          <KpiCard label={t.walkInsOpen} value={kpis.walkInsOpen} active={filter === 'WALKIN'} onClick={() => setFilter(filter === 'WALKIN' ? 'ALL' : 'WALKIN')} accent="#3C3489" accentBg="#EEEDFE" />
          <KpiCard label={t.revenueMonth} value={formatMAD(monthlyRevenue)} accent="#7A5A14" accentBg="#FBF5E0" isText />
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <Pill active={filter === 'ALL'} onClick={() => setFilter('ALL')}>{t.all}</Pill>
        <Pill active={filter === 'IN_PROGRESS'} onClick={() => setFilter('IN_PROGRESS')}>{t.inProgress}</Pill>
        <Pill active={filter === 'CONFIRMED'} onClick={() => setFilter('CONFIRMED')}>{t.confirmed}</Pill>
        <Pill active={filter === 'PENDING'} onClick={() => setFilter('PENDING')}>{t.pending}</Pill>
        <Pill active={filter === 'WALKIN'} onClick={() => setFilter('WALKIN')}>{t.walkin}</Pill>
        <Pill active={filter === 'CANCELLED'} onClick={() => setFilter('CANCELLED')}>{t.cancelled}</Pill>
        <Pill active={filter === 'NO_SHOW'} onClick={() => setFilter('NO_SHOW')}>{t.noShow}</Pill>
        <span className="h-5 w-px bg-ivory-200 self-center mx-1" aria-hidden />
        <Pill active={filter === 'BOARDING'} onClick={() => setFilter('BOARDING')}>{t.boarding}</Pill>
        <Pill active={filter === 'PET_TAXI'} onClick={() => setFilter('PET_TAXI')}>{t.taxi}</Pill>
        <div className="ml-auto relative">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} className="pl-9 pr-3 py-1.5 text-sm rounded-lg border border-ivory-200 focus:outline-none focus:border-gold-400 w-72" />
        </div>
      </div>

      <div className="bg-white rounded-[14px] overflow-hidden" style={{ border: '0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.08))' }}>
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>{t.none}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead style={{ background: 'var(--color-background-secondary, #FAF7F0)' }}>
                <tr>
                  <th className="px-4 py-3 w-12" aria-hidden />
                  <th className="text-left text-[10px] uppercase tracking-wide font-semibold text-gray-400 px-2 py-3">{t.cols.client}</th>
                  <th className="text-left text-[10px] uppercase tracking-wide font-semibold text-gray-400 px-4 py-3">{t.cols.animals}</th>
                  <th className="text-left text-[10px] uppercase tracking-wide font-semibold text-gray-400 px-4 py-3">{t.cols.status}</th>
                  <th className="text-left text-[10px] uppercase tracking-wide font-semibold text-gray-400 px-4 py-3">{t.cols.dates}</th>
                  <th className="text-left text-[10px] uppercase tracking-wide font-semibold text-gray-400 px-4 py-3">{t.cols.services}</th>
                  <th className="text-right text-[10px] uppercase tracking-wide font-semibold text-gray-400 px-4 py-3">{t.cols.total}</th>
                  <th className="px-3 py-3 w-8" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, page * PAGE_SIZE).map((b) => (
                  <Row key={b.id} b={b} locale={locale} t={t} />
                ))}
              </tbody>
            </table>
            {filtered.length > page * PAGE_SIZE && (
              <div className="px-4 py-4 border-t border-ivory-100 flex items-center justify-center">
                <button type="button" onClick={() => setPage((p) => p + 1)} className="px-4 py-2 text-sm font-medium text-charcoal bg-[#FAF6F0] hover:bg-[#F0E6CF] rounded-lg border border-[#F0D98A]/40 transition-colors">
                  {locale === 'en' ? `Load more (${filtered.length - page * PAGE_SIZE} remaining)` : `Charger plus (${filtered.length - page * PAGE_SIZE} restantes)`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
