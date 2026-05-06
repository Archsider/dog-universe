'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, Search, Download, Plus, Calendar } from 'lucide-react';
import { formatMAD } from '@/lib/utils';

export type ReservationRow = {
  id: string;
  status: string;
  serviceType: 'BOARDING' | 'PET_TAXI';
  startDate: string;       // ISO
  endDate: string | null;  // ISO
  isOpenEnded: boolean;
  totalPrice: number;
  invoiceAmount: number | null;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    isWalkIn: boolean;
  };
  pets: { name: string; species: 'DOG' | 'CAT' }[];
  hasTaxi: boolean;       // standalone or addon
  taxiReturn: boolean;    // A+R if true
  taxiAddon: boolean;     // boarding + taxi addon
};

type Filter =
  | 'ALL'
  | 'IN_PROGRESS'
  | 'PENDING'
  | 'WALKIN'
  | 'BOARDING'
  | 'PET_TAXI';

type Props = {
  bookings: ReservationRow[];
  locale: string;
  monthlyRevenue: number;
  initialFilter?: Filter;
};

const AVATAR_PALETTE = [
  { bg: '#FDE6CC', fg: '#8C4A0E' },
  { bg: '#E0F2F1', fg: '#0E5752' },
  { bg: '#FCE4EC', fg: '#7E1A48' },
  { bg: '#EEEDFE', fg: '#3C3489' },
  { bg: '#E6F1FB', fg: '#0C447C' },
  { bg: '#FFF4D2', fg: '#8C6B0E' },
  { bg: '#E5F6E0', fg: '#2D6019' },
  { bg: '#F4E1FA', fg: '#5C2076' },
];

function colorFromName(name: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function initialsFrom(first: string, last: string): string {
  const a = (first?.[0] ?? '').toUpperCase();
  const b = (last?.[0] ?? '').toUpperCase();
  return (a + b) || '?';
}

const FR_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatShort(iso: string, locale: string): string {
  const d = new Date(iso);
  const months = locale === 'fr' ? FR_MONTHS : EN_MONTHS;
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function nightsBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

function nightsSince(startIso: string): number {
  const ms = Date.now() - new Date(startIso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

// Active stay = status only, gated on startDate (don't surface a future
// CONFIRMED booking as "in progress"). endDate is intentionally NOT used:
// the admin transitions to COMPLETED when the pet leaves.
function isInProgressNow(b: ReservationRow): boolean {
  if (b.status !== 'CONFIRMED' && b.status !== 'IN_PROGRESS') return false;
  return new Date(b.startDate).getTime() <= Date.now();
}

// Open-ended = walk-in flag OR no endDate set. Both treated identically.
function isOpenEndedRow(b: ReservationRow): boolean {
  return b.isOpenEnded || b.endDate == null;
}

export default function ReservationsList({ bookings, locale, monthlyRevenue, initialFilter = 'ALL' }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState('');

  // Sync filter back to URL (no scroll, replace) so deep links keep working.
  useEffect(() => {
    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    if (filter === 'ALL') sp.delete('f');
    else sp.set('f', filter);
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const t = useMemo(() => locale === 'en' ? {
    title: 'Bookings',
    subActiveStays: 'active stays',
    subWalkIns: 'open walk-ins',
    inProgress: 'In progress',
    pending: 'Pending',
    walkInsOpen: 'Open walk-ins',
    revenueMonth: 'Revenue this month',
    all: 'All',
    walkin: 'Walk-in',
    boarding: 'Boarding',
    taxi: 'Taxi',
    search: 'Search client or pet…',
    export: 'Export',
    create: 'New booking',
    none: 'No bookings',
    nights: 'nights',
    nightsOngoing: 'nights ongoing',
    provisional: 'provisional',
    cols: { client: 'Client', animals: 'Pets', status: 'Status', dates: 'Dates', services: 'Services', total: 'Total' },
    statusLabel: { IN_PROGRESS: 'In progress', PENDING: 'Pending', WALKIN: 'Walk-in', COMPLETED: 'Completed', CONFIRMED: 'Confirmed', CANCELLED: 'Cancelled', REJECTED: 'Rejected', AT_PICKUP: 'At pickup', PENDING_EXTENSION: 'Extension', NO_SHOW: 'No-show', WAITLIST: 'Waitlist' },
    taxiOneway: 'One-way taxi',
    taxiRoundtrip: 'Round-trip taxi',
    boardingBadge: 'Boarding',
  } : {
    title: 'Réservations',
    subActiveStays: 'séjours actifs',
    subWalkIns: 'walk-ins ouverts',
    inProgress: 'En cours',
    pending: 'En attente',
    walkInsOpen: 'Walk-ins ouverts',
    revenueMonth: 'CA ce mois',
    all: 'Toutes',
    walkin: 'Walk-in',
    boarding: 'Pension',
    taxi: 'Taxi',
    search: 'Rechercher client ou animal…',
    export: 'Exporter',
    create: 'Nouvelle réservation',
    none: 'Aucune réservation',
    nights: 'nuits',
    nightsOngoing: 'nuits en cours',
    provisional: 'provisoire',
    cols: { client: 'Client', animals: 'Animaux', status: 'Statut', dates: 'Dates', services: 'Services', total: 'Total' },
    statusLabel: { IN_PROGRESS: 'En cours', PENDING: 'En attente', WALKIN: 'Walk-in', COMPLETED: 'Terminée', CONFIRMED: 'Confirmée', CANCELLED: 'Annulée', REJECTED: 'Refusée', AT_PICKUP: 'Sur place', PENDING_EXTENSION: 'Extension', NO_SHOW: 'Absent', WAITLIST: 'Liste d\'attente' },
    taxiOneway: 'Taxi aller',
    taxiRoundtrip: 'Taxi A+R',
    boardingBadge: 'Pension',
  }, [locale]);

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
      // Filter
      switch (filter) {
        case 'IN_PROGRESS':
          if (!isInProgressNow(b)) return false;
          break;
        case 'PENDING':
          if (b.status !== 'PENDING') return false;
          break;
        case 'WALKIN':
          if (!isOpenEndedRow(b)) return false;
          if (b.status === 'COMPLETED' || b.status === 'CANCELLED' || b.status === 'REJECTED') return false;
          break;
        case 'BOARDING':
          if (b.serviceType !== 'BOARDING') return false;
          break;
        case 'PET_TAXI':
          if (b.serviceType !== 'PET_TAXI') return false;
          break;
        case 'ALL':
        default:
          break;
      }
      // Search
      if (q) {
        const fullName = `${b.client.firstName} ${b.client.lastName}`.toLowerCase();
        const inClient = fullName.includes(q);
        const inPets = b.pets.some(p => p.name.toLowerCase().includes(q));
        if (!inClient && !inPets) return false;
      }
      return true;
    });
  }, [bookings, filter, query]);

  // Header subtitle: "<Month YYYY> · X séjours actifs · Y walk-ins ouverts"
  const monthName = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' });
  }, [locale]);

  const handleExport = () => {
    // Excel formula-injection guard: prefix dangerous starting chars.
    const esc = (raw: string | number | null | undefined) => {
      const s = raw == null ? '' : String(raw);
      const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const headers = ['ID', 'Client', 'Phone', 'Pets', 'Status', 'Start', 'End', 'OpenEnded', 'Service', 'HasTaxi', 'Total'];
    const rows = filtered.map(b => [
      b.id,
      `${b.client.firstName} ${b.client.lastName}`,
      b.client.phone ?? '',
      b.pets.map(p => `${p.name} (${p.species})`).join(' | '),
      b.status,
      b.startDate.slice(0, 10),
      b.endDate ? b.endDate.slice(0, 10) : '',
      b.isOpenEnded ? 'true' : 'false',
      b.serviceType,
      b.hasTaxi ? (b.taxiReturn ? 'roundtrip' : 'oneway') : '',
      b.invoiceAmount ?? b.totalPrice,
    ]);
    const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-serif font-bold text-charcoal">{t.title}</h1>
          <p className="text-sm text-charcoal/50 mt-0.5 capitalize">
            {monthName} · {kpis.inProgress} {t.subActiveStays} · {kpis.walkInsOpen} {t.subWalkIns}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white border border-ivory-200 text-charcoal rounded-lg hover:border-gold-300 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            {t.export}
          </button>
          <Link href={`/${locale}/admin/reservations/new`}>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gold-500 text-white rounded-lg hover:bg-gold-600 transition-colors">
              <Plus className="h-3.5 w-3.5" />
              {t.create}
            </button>
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label={t.inProgress}
          value={kpis.inProgress}
          active={filter === 'IN_PROGRESS'}
          onClick={() => setFilter(filter === 'IN_PROGRESS' ? 'ALL' : 'IN_PROGRESS')}
          accent="#3B6D11"
          accentBg="#EAF3DE"
        />
        <KpiCard
          label={t.pending}
          value={kpis.pending}
          active={filter === 'PENDING'}
          onClick={() => setFilter(filter === 'PENDING' ? 'ALL' : 'PENDING')}
          accent="#854F0B"
          accentBg="#FAEEDA"
        />
        <KpiCard
          label={t.walkInsOpen}
          value={kpis.walkInsOpen}
          active={filter === 'WALKIN'}
          onClick={() => setFilter(filter === 'WALKIN' ? 'ALL' : 'WALKIN')}
          accent="#3C3489"
          accentBg="#EEEDFE"
        />
        <KpiCard
          label={t.revenueMonth}
          value={formatMAD(monthlyRevenue)}
          accent="#7A5A14"
          accentBg="#FBF5E0"
          isText
        />
      </div>

      {/* Pills + search */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <Pill active={filter === 'ALL'} onClick={() => setFilter('ALL')}>{t.all}</Pill>
        <Pill active={filter === 'IN_PROGRESS'} onClick={() => setFilter('IN_PROGRESS')}>{t.inProgress}</Pill>
        <Pill active={filter === 'PENDING'} onClick={() => setFilter('PENDING')}>{t.pending}</Pill>
        <Pill active={filter === 'WALKIN'} onClick={() => setFilter('WALKIN')}>{t.walkin}</Pill>
        <span className="h-5 w-px bg-ivory-200 self-center mx-1" aria-hidden />
        <Pill active={filter === 'BOARDING'} onClick={() => setFilter('BOARDING')}>{t.boarding}</Pill>
        <Pill active={filter === 'PET_TAXI'} onClick={() => setFilter('PET_TAXI')}>{t.taxi}</Pill>
        <div className="ml-auto relative">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.search}
            className="pl-9 pr-3 py-1.5 text-sm rounded-lg border border-ivory-200 focus:outline-none focus:border-gold-400 w-72"
          />
        </div>
      </div>

      {/* Table */}
      <div
        className="bg-white rounded-[14px] overflow-hidden"
        style={{ border: '0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.08))' }}
      >
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
                {filtered.map((b) => (
                  <Row key={b.id} b={b} locale={locale} t={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function KpiCard({
  label, value, active, onClick, accent, accentBg, isText,
}: {
  label: string;
  value: string | number;
  active?: boolean;
  onClick?: () => void;
  accent: string;
  accentBg: string;
  isText?: boolean;
}) {
  const clickable = !!onClick;
  const Tag = clickable ? 'button' : 'div';
  return (
    <Tag
      type={clickable ? 'button' : undefined}
      onClick={onClick}
      className={`text-left bg-white rounded-[12px] p-4 transition-all ${clickable ? 'hover:shadow-card-hover cursor-pointer' : ''}`}
      style={{
        border: `0.5px solid ${active ? accent : 'var(--color-border-tertiary, rgba(0,0,0,0.08))'}`,
        boxShadow: active ? `0 0 0 2px ${accentBg}` : undefined,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
        <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: accent }}>
          {label}
        </span>
      </div>
      <div className={`font-bold text-charcoal ${isText ? 'text-xl' : 'text-2xl'}`}>{value}</div>
    </Tag>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-charcoal text-white'
          : 'bg-white border border-ivory-200 text-gray-600 hover:border-gold-300'
      }`}
    >
      {children}
    </button>
  );
}

function Row({
  b, locale, t,
}: {
  b: ReservationRow;
  locale: string;
  t: ReturnType<typeof labelsFor>;
}) {
  const isWalkInRow = isOpenEndedRow(b);
  const initials = initialsFrom(b.client.firstName, b.client.lastName);
  const avatarColor = colorFromName(`${b.client.firstName} ${b.client.lastName}`);
  const totalAmount = b.invoiceAmount ?? b.totalPrice;

  // Status pill (overrides DB status when row is "in-progress" or "walk-in open")
  let statusKey: keyof typeof t.statusLabel = b.status as keyof typeof t.statusLabel;
  let statusBg = '#F3F4F6';
  let statusFg = '#4B5563';
  if (isInProgressNow(b)) {
    statusKey = 'IN_PROGRESS';
    statusBg = '#EAF3DE'; statusFg = '#3B6D11';
  } else if (b.status === 'PENDING') {
    statusKey = 'PENDING';
    statusBg = '#FAEEDA'; statusFg = '#854F0B';
  } else if (isWalkInRow && b.status !== 'COMPLETED') {
    statusKey = 'WALKIN';
    statusBg = '#EEEDFE'; statusFg = '#3C3489';
  } else if (b.status === 'COMPLETED') {
    statusBg = '#F3F4F6'; statusFg = '#4B5563';
  }

  // Dates — open-ended (flag OR endDate=null) shows "?" + ongoing nights count.
  const startStr = formatShort(b.startDate, locale);
  const endStr = b.endDate && !b.isOpenEnded ? formatShort(b.endDate, locale) : '?';
  let nightsLine: string;
  if (isWalkInRow) {
    nightsLine = `${nightsSince(b.startDate)} ${t.nightsOngoing}`;
  } else if (b.endDate) {
    nightsLine = `${nightsBetween(b.startDate, b.endDate)} ${t.nights}`;
  } else {
    nightsLine = '';
  }

  // Services badges
  const serviceBadges: { label: string; bg: string; fg: string }[] = [];
  if (b.serviceType === 'BOARDING') {
    serviceBadges.push({ label: t.boardingBadge, bg: '#E6F1FB', fg: '#0C447C' });
    if (b.taxiAddon) {
      serviceBadges.push({
        label: b.taxiReturn ? t.taxiRoundtrip : t.taxiOneway,
        bg: '#FFE4DC', fg: '#A93521',
      });
    }
  } else if (b.serviceType === 'PET_TAXI') {
    serviceBadges.push({
      label: b.taxiReturn ? t.taxiRoundtrip : t.taxiOneway,
      bg: '#FFE4DC', fg: '#A93521',
    });
  }

  const rowBg = isWalkInRow ? '#FFFDF7' : undefined;

  return (
    <tr
      className="border-t hover:bg-[var(--color-background-secondary,#FAF7F0)] transition-colors"
      style={{ borderTop: '0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.06))', background: rowBg }}
    >
      <td className="px-4 py-3 align-middle">
        <div
          className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: avatarColor.bg, color: avatarColor.fg }}
          aria-hidden
        >
          {initials}
        </div>
      </td>
      <td className="px-2 py-3 align-middle">
        <Link
          href={`/${locale}/admin/clients/${b.client.id}`}
          className="text-sm font-semibold text-charcoal hover:text-gold-600"
          onClick={(e) => e.stopPropagation()}
        >
          {b.client.firstName} {b.client.lastName}
        </Link>
        {b.client.phone && (
          <div className="text-xs text-gray-400 mt-0.5">{b.client.phone}</div>
        )}
      </td>
      <td className="px-4 py-3 align-middle">
        <div className="flex flex-wrap gap-1">
          {b.pets.map((p, i) => {
            const isDog = p.species === 'DOG';
            return (
              <span
                key={`${p.name}-${i}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[8px] text-xs font-medium"
                style={{
                  background: isDog ? '#E6F1FB' : '#FBEAF0',
                  color: isDog ? '#0C447C' : '#72243E',
                }}
              >
                <span aria-hidden>{isDog ? '🐶' : '🐱'}</span>
                {p.name}
              </span>
            );
          })}
        </div>
      </td>
      <td className="px-4 py-3 align-middle">
        <span
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[8px] text-xs font-semibold"
          style={{ background: statusBg, color: statusFg }}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: statusFg }} aria-hidden />
          {t.statusLabel[statusKey] ?? statusKey}
        </span>
      </td>
      <td className="px-4 py-3 align-middle">
        <div className="text-sm font-medium text-charcoal">
          {startStr} → {endStr}
        </div>
        {nightsLine && (
          <div className="text-xs text-gray-400 mt-0.5">{nightsLine}</div>
        )}
      </td>
      <td className="px-4 py-3 align-middle">
        <div className="flex flex-col gap-1">
          {serviceBadges.map((s, i) => (
            <span
              key={i}
              className="inline-flex items-center px-2 py-0.5 rounded-[8px] text-xs font-medium w-fit"
              style={{ background: s.bg, color: s.fg }}
            >
              {s.label}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 align-middle text-right">
        <div className="text-sm font-bold text-charcoal">{formatMAD(totalAmount)}</div>
        {isWalkInRow && (
          <div className="text-xs mt-0.5" style={{ color: '#854F0B' }}>{t.provisional}</div>
        )}
      </td>
      <td className="px-3 py-3 align-middle">
        <Link href={`/${locale}/admin/reservations/${b.id}`} aria-label="open">
          <ChevronRight className="h-4 w-4 text-gray-400 hover:text-gold-500" />
        </Link>
      </td>
    </tr>
  );
}

// Stub used only for TypeScript inference of the `t` shape passed to <Row>.
function labelsFor(): {
  nights: string;
  nightsOngoing: string;
  provisional: string;
  boardingBadge: string;
  taxiOneway: string;
  taxiRoundtrip: string;
  statusLabel: Record<string, string>;
} {
  throw new Error('typing stub');
}
