'use client';

import { type ReactNode } from 'react';
import { formatMAD } from '@/lib/utils';
import { casablancaYMD } from '@/lib/dates-casablanca';
import type { BookingDetail } from '@/types/booking-detail';

const FR_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso: string, locale: string): string {
  const { year, month, day } = casablancaYMD(iso);
  const months = locale === 'fr' ? FR_MONTHS : EN_MONTHS;
  return `${day} ${months[month - 1]} ${year}`;
}

function nights(startIso: string, endIso: string): number {
  return Math.max(1, Math.ceil((new Date(endIso).getTime() - new Date(startIso).getTime()) / 86_400_000));
}

const STATUS_STYLES: Record<string, { bg: string; fg: string }> = {
  PENDING:     { bg: '#FAEEDA', fg: '#854F0B' },
  CONFIRMED:   { bg: '#E6F1FB', fg: '#0C447C' },
  IN_PROGRESS: { bg: '#EAF3DE', fg: '#3B6D11' },
  COMPLETED:   { bg: '#F3F4F6', fg: '#4B5563' },
  CANCELLED:   { bg: '#FEE2E2', fg: '#991B1B' },
  REJECTED:    { bg: '#FEE2E2', fg: '#991B1B' },
  NO_SHOW:     { bg: '#FEF3C7', fg: '#92400E' },
};

const STATUS_LABELS: Record<string, Record<string, string>> = {
  fr: { PENDING: 'En attente', CONFIRMED: 'Confirmé', IN_PROGRESS: 'En cours', COMPLETED: 'Terminé', CANCELLED: 'Annulé', REJECTED: 'Refusé', NO_SHOW: 'No-show', WAITLIST: "Liste d'attente", PENDING_EXTENSION: 'Extension en attente' },
  en: { PENDING: 'Pending', CONFIRMED: 'Confirmed', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled', REJECTED: 'Rejected', NO_SHOW: 'No-show', WAITLIST: 'Waitlist', PENDING_EXTENSION: 'Extension pending' },
};

function Chip({ label }: { label: string }) {
  return <span className="text-xs bg-ivory-100 text-gray-600 rounded-full px-2.5 py-0.5">{label}</span>;
}

function InfoCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <div className="text-sm text-charcoal font-medium">{children}</div>
    </div>
  );
}

export default function OverviewSection({ b, locale }: { b: BookingDetail; locale: string }) {
  const fr = locale !== 'en';
  const sl = STATUS_LABELS[locale] ?? STATUS_LABELS.fr;
  const style = STATUS_STYLES[b.status] ?? { bg: '#F3F4F6', fg: '#4B5563' };

  const nightsCount = b.endDate && !b.isOpenEnded
    ? nights(b.startDate, b.endDate)
    : b.liveNights ?? null;
  const totalDisplay = b.liveTotal ?? b.totalPrice;

  return (
    <div className="space-y-4">
      {/* Status pill */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="text-xs font-semibold rounded-full px-3 py-1"
          style={{ background: style.bg, color: style.fg }}
        >
          {sl[b.status] ?? b.status}
        </span>
        <Chip label={b.serviceType === 'BOARDING' ? (fr ? 'Pension' : 'Boarding') : 'Taxi'} />
        {b.isOpenEnded && <Chip label={fr ? 'Ouvert' : 'Open-ended'} />}
        {b.client.isWalkIn && <Chip label="Walk-in" />}
      </div>

      {/* Key data grid */}
      <div className="grid grid-cols-2 gap-2">
        <InfoCell label={fr ? 'Arrivée' : 'Arrival'}>
          {fmtDate(b.startDate, locale)}
          {b.arrivalTime && <span className="text-xs text-gray-400 ml-1">· {b.arrivalTime}</span>}
        </InfoCell>
        <InfoCell label={fr ? 'Départ' : 'Departure'}>
          {b.endDate && !b.isOpenEnded ? fmtDate(b.endDate, locale) : <span className="text-gray-400">?</span>}
        </InfoCell>
        {nightsCount !== null && (
          <InfoCell label={fr ? 'Nuits' : 'Nights'}>
            {nightsCount}
            {b.isOpenEnded && <span className="text-xs text-amber-600 ml-1">({fr ? 'en cours' : 'ongoing'})</span>}
          </InfoCell>
        )}
        <InfoCell label={fr ? 'Montant' : 'Amount'}>
          {formatMAD(totalDisplay)}
          {b.isOpenEnded && b.liveTotal !== null && (
            <span className="text-xs text-amber-600 ml-1">({fr ? 'provisoire' : 'est.'})</span>
          )}
        </InfoCell>
      </div>

      {/* Services */}
      {b.boarding && (b.boarding.groomingEnabled || b.boarding.taxiGoEnabled) && (
        <div className="flex gap-1.5 flex-wrap">
          {b.boarding.groomingEnabled && (
            <Chip label={`🛁 ${fr ? 'Toilettage' : 'Grooming'}${b.boarding.groomingPrice ? ` — ${formatMAD(b.boarding.groomingPrice)}` : ''}`} />
          )}
          {b.boarding.taxiGoEnabled && <Chip label={`🚕 Taxi ${fr ? 'aller' : 'pickup'}`} />}
          {b.boarding.taxiReturnEnabled && <Chip label={`🚕 Taxi ${fr ? 'retour' : 'return'}`} />}
        </div>
      )}

      {/* Taxi addresses */}
      {b.taxi && (b.taxi.pickupAddress || b.taxi.dropoffAddress) && (
        <div className="text-xs text-gray-500 space-y-1">
          {b.taxi.pickupAddress && <p>📍 {b.taxi.pickupAddress}</p>}
          {b.taxi.dropoffAddress && <p>🏁 {b.taxi.dropoffAddress}</p>}
        </div>
      )}

      {/* Cancellation reason */}
      {b.cancellationReason && (
        <div className="bg-red-50 border border-red-100 rounded-lg p-3">
          <p className="text-xs text-red-600 font-medium mb-1">{fr ? 'Motif' : 'Reason'}</p>
          <p className="text-sm text-red-700">{b.cancellationReason}</p>
        </div>
      )}
    </div>
  );
}
