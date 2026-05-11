'use client';

import Link from 'next/link';
import { formatDate, formatMAD, getInitials } from '@/lib/utils';
import DiscountButton from '../DiscountButton';
import { getDisplayEmail, type InvoiceData } from './lib';

// ── Client + Summary cards ───────────────────────────────────────────────────

interface ClientSummaryProps {
  invoice: InvoiceData;
  locale: string;
  isFr: boolean;
  remaining: number;
}

export function ClientSummaryCards({
  invoice, locale, isFr, remaining,
}: ClientSummaryProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Client */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          {isFr ? 'Client' : 'Client'}
        </p>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gold-100 flex items-center justify-center text-sm font-semibold text-gold-700 flex-shrink-0">
            {getInitials(invoice.clientDisplayName ?? invoice.client.name)}
          </div>
          <div>
            <Link
              href={`/${locale}/admin/clients/${invoice.client.id}`}
              className="font-semibold text-charcoal hover:text-gold-600 text-sm"
            >
              {invoice.clientDisplayName ?? invoice.client.name}
            </Link>
            {!!getDisplayEmail(invoice) && (
              <p className="text-xs text-gray-500">{getDisplayEmail(invoice)}</p>
            )}
            {(invoice.clientDisplayPhone ?? invoice.client.phone) && (
              <p className="text-xs text-gray-400">{invoice.clientDisplayPhone ?? invoice.client.phone}</p>
            )}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            {isFr ? 'Récapitulatif' : 'Summary'}
          </p>
          <DiscountButton
            invoiceId={invoice.id}
            hasDiscount={invoice.items.some((it) => it.category === 'DISCOUNT')}
            locale={locale}
            disabled={invoice.status === 'CANCELLED'}
          />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">{isFr ? 'Total facture' : 'Invoice total'}</span>
            <span className="font-bold text-charcoal">{formatMAD(invoice.amount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">{isFr ? 'Montant réglé' : 'Amount paid'}</span>
            <span className={`font-semibold ${Number(invoice.paidAmount) > 0 ? 'text-green-600' : 'text-gray-400'}`}>
              {Number(invoice.paidAmount) > 0 ? formatMAD(invoice.paidAmount) : '—'}
            </span>
          </div>
          {remaining > 0 && (
            <div className="flex justify-between text-sm border-t border-ivory-100 pt-2">
              <span className="text-gray-600 font-medium">{isFr ? 'Reste à payer' : 'Remaining'}</span>
              <span className="font-bold text-orange-600">{formatMAD(remaining)}</span>
            </div>
          )}
          {invoice.paidAt && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{isFr ? 'Payée le' : 'Paid on'}</span>
              <span className="text-xs text-green-600">{formatDate(invoice.paidAt, locale)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stay encart ──────────────────────────────────────────────────────────────

export function StayEncart({ invoice, isFr }: { invoice: InvoiceData; isFr: boolean }) {
  if (!invoice.booking?.startDate) return null;
  const start = new Date(invoice.booking.startDate);
  const end = invoice.booking.endDate ? new Date(invoice.booking.endDate) : null;
  const nights = end
    ? Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const fmtDate = (d: Date) =>
    d.toLocaleDateString(isFr ? 'fr-MA' : 'en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  return (
    <div className="bg-[#FAF6F0] rounded-xl border border-[#F0D98A]/60 px-4 py-3 flex items-center gap-3">
      <div className="text-gold-600 text-lg flex-shrink-0">📅</div>
      <div className="text-sm text-charcoal">
        {end ? (
          <>
            <span className="font-semibold">
              {isFr ? `Du ${fmtDate(start)} au ${fmtDate(end)}` : `From ${fmtDate(start)} to ${fmtDate(end)}`}
            </span>
            {nights !== null && nights > 0 && (
              <span className="text-gray-500 ml-2">
                — {nights} {isFr ? (nights > 1 ? 'nuits' : 'nuit') : (nights > 1 ? 'nights' : 'night')}
              </span>
            )}
          </>
        ) : (
          <span className="font-semibold">{isFr ? `Le ${fmtDate(start)}` : `On ${fmtDate(start)}`}</span>
        )}
      </div>
    </div>
  );
}

// ── Notes ────────────────────────────────────────────────────────────────────

export function NotesView({ invoice, isFr }: { invoice: InvoiceData; isFr: boolean }) {
  if (!invoice.notes || invoice.notes.startsWith('EXTENSION_SURCHARGE:')) return null;
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        {isFr ? 'Notes' : 'Notes'}
      </p>
      <p className="text-sm text-gray-600 italic">{invoice.notes}</p>
    </div>
  );
}

// ── Booking link ─────────────────────────────────────────────────────────────

export function BookingLink({
  invoice, locale, isFr,
}: { invoice: InvoiceData; locale: string; isFr: boolean }) {
  if (!invoice.booking) return null;
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        {isFr ? 'Réservation liée' : 'Linked booking'}
      </p>
      <Link
        href={`/${locale}/admin/reservations/${invoice.booking.id}`}
        className="text-sm text-gold-600 hover:text-gold-700 font-medium hover:underline"
      >
        {invoice.booking.serviceType === 'BOARDING'
          ? (isFr ? 'Pension' : 'Boarding')
          : (isFr ? 'Taxi animalier' : 'Pet Taxi')}
        {invoice.booking.startDate && (
          <> · {formatDate(invoice.booking.startDate, locale)}</>
        )}
      </Link>
      {invoice.booking.bookingPets.length > 0 && (
        <p className="text-xs text-gray-400 mt-1">
          {invoice.booking.bookingPets.map(bp => bp.pet.name).join(', ')}
        </p>
      )}
    </div>
  );
}
