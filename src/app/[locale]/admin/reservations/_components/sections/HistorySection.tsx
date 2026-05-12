'use client';

import type { BookingDetail } from '@/types/booking-detail';

const ACTION_ICONS: Record<string, string> = {
  BOOKING_CREATED: '📋',
  BOOKING_CONFIRMED: '✅',
  BOOKING_REJECTED: '❌',
  BOOKING_CANCELLED: '🚫',
  BOOKING_CHECKIN: '🏠',
  BOOKING_CHECKOUT: '🏁',
  BOOKING_UPDATED: '✏️',
  INVOICE_CREATED: '🧾',
  INVOICE_PAID: '💳',
  PAYMENT_RECORDED: '💰',
  MESSAGE_SENT: '💬',
};

function relativeTime(isoDate: string, locale: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (locale === 'fr') {
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `il y a ${minutes} min`;
    if (hours < 24) return `il y a ${hours}h`;
    if (days < 7) return `il y a ${days}j`;
    return new Date(isoDate).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' });
  }
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function humanizeAction(action: string, locale: string): string {
  const fr = locale !== 'en';
  const map: Record<string, Record<string, string>> = {
    fr: {
      BOOKING_CREATED: 'Réservation créée',
      BOOKING_CONFIRMED: 'Réservation confirmée',
      BOOKING_REJECTED: 'Réservation refusée',
      BOOKING_CANCELLED: 'Réservation annulée',
      BOOKING_CHECKIN: 'Check-in effectué',
      BOOKING_CHECKOUT: 'Clôture du séjour',
      BOOKING_UPDATED: 'Réservation modifiée',
      INVOICE_CREATED: 'Facture créée',
      INVOICE_PAID: 'Facture payée',
      PAYMENT_RECORDED: 'Paiement enregistré',
      MESSAGE_SENT: 'Message envoyé',
    },
    en: {
      BOOKING_CREATED: 'Booking created',
      BOOKING_CONFIRMED: 'Booking confirmed',
      BOOKING_REJECTED: 'Booking rejected',
      BOOKING_CANCELLED: 'Booking cancelled',
      BOOKING_CHECKIN: 'Check-in done',
      BOOKING_CHECKOUT: 'Stay closed',
      BOOKING_UPDATED: 'Booking updated',
      INVOICE_CREATED: 'Invoice created',
      INVOICE_PAID: 'Invoice paid',
      PAYMENT_RECORDED: 'Payment recorded',
      MESSAGE_SENT: 'Message sent',
    },
  };
  const lang = fr ? 'fr' : 'en';
  return map[lang][action] ?? action.replace(/_/g, ' ').toLowerCase();
}

export default function HistorySection({
  actionLog,
  createdAt,
  locale,
}: {
  actionLog: BookingDetail['actionLog'];
  createdAt: string;
  locale: string;
}) {
  const fr = locale !== 'en';
  const entries = [
    // Always add a "created" entry at the bottom if no log exists
    ...(actionLog.length === 0
      ? [{ id: '__created', action: 'BOOKING_CREATED', details: null, createdAt, userName: null }]
      : actionLog),
  ];

  return (
    <div className="relative">
      {/* Vertical timeline line */}
      <div className="absolute left-[19px] top-4 bottom-4 w-px bg-ivory-200" aria-hidden />

      <div className="space-y-4">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-ivory-100 flex items-center justify-center text-base flex-shrink-0 z-10">
              {ACTION_ICONS[entry.action] ?? '📌'}
            </div>
            <div className="flex-1 min-w-0 pt-1.5">
              <p className="text-sm text-charcoal font-medium">
                {humanizeAction(entry.action, locale)}
              </p>
              {entry.userName && (
                <p className="text-xs text-gray-400">{fr ? 'par' : 'by'} {entry.userName}</p>
              )}
              {entry.details && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">{entry.details}</p>
              )}
            </div>
            <span className="text-xs text-gray-400 pt-1.5 flex-shrink-0">
              {relativeTime(entry.createdAt, locale)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
