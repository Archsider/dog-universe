'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { formatMAD } from '@/lib/utils';
import {
  colorFromName,
  initialsFrom,
  formatShort,
  nightsBetween,
  nightsSince,
  isInProgressNow,
  isOpenEndedRow,
  type ReservationRow,
  type ListTranslations,
} from '../_lib/list-types';

export function Row({
  b, locale, t,
}: {
  b: ReservationRow;
  locale: string;
  t: ListTranslations;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isWalkInRow = isOpenEndedRow(b);
  const initials = initialsFrom(b.client.firstName, b.client.lastName);
  const avatarColor = colorFromName(`${b.client.firstName} ${b.client.lastName}`);
  const totalAmount = b.invoiceAmount ?? b.totalPrice;

  function openPanel(e: React.MouseEvent) {
    e.stopPropagation();
    const next = new URLSearchParams(searchParams.toString());
    next.set('booking', b.id);
    router.replace(`${pathname}?${next.toString()}`);
  }

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
      className="border-t hover:bg-[var(--color-background-secondary,#FAF7F0)] transition-colors cursor-pointer"
      style={{ borderTop: '0.5px solid var(--color-border-tertiary, rgba(0,0,0,0.06))', background: rowBg }}
      onClick={openPanel}
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
        <button type="button" onClick={openPanel} aria-label="open panel" className="p-0.5">
          <ChevronRight className="h-4 w-4 text-gray-400 hover:text-gold-500" />
        </button>
      </td>
    </tr>
  );
}
