'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { BookingStatus, ServiceType } from '@/types/booking-detail';

// BOARDING linear transitions
const BOARDING_NEXT: Partial<Record<BookingStatus, BookingStatus>> = {
  PENDING: 'CONFIRMED',
  CONFIRMED: 'IN_PROGRESS',
};

// Status after IN_PROGRESS is COMPLETED — handled via CloseStayDialog (checkout)
const PET_TAXI_NEXT: Partial<Record<BookingStatus, BookingStatus>> = {
  PENDING: 'CONFIRMED',
};

const ACTION_LABELS: Record<string, Record<BookingStatus, { fr: string; en: string }>> = {
  BOARDING: {
    PENDING:           { fr: 'Confirmer le séjour',       en: 'Confirm stay' },
    CONFIRMED:         { fr: 'Marquer "Dans nos murs"',   en: 'Mark as staying' },
    IN_PROGRESS:       { fr: 'Clôturer le séjour',        en: 'Close stay' },
    COMPLETED:         { fr: 'Voir la facture',            en: 'View invoice' },
    CANCELLED:         { fr: 'Restaurer',                  en: 'Restore' },
    REJECTED:          { fr: 'Restaurer',                  en: 'Restore' },
    NO_SHOW:           { fr: 'Restaurer',                  en: 'Restore' },
    WAITLIST:          { fr: 'Confirmer',                  en: 'Confirm' },
    PENDING_EXTENSION: { fr: "Voir l'extension",           en: 'View extension' },
  },
  PET_TAXI: {
    PENDING:           { fr: 'Confirmer le transport',     en: 'Confirm transport' },
    CONFIRMED:         { fr: 'Marquer "En route"',         en: 'Mark en route' },
    IN_PROGRESS:       { fr: 'Marquer "Terminé"',          en: 'Mark complete' },
    COMPLETED:         { fr: 'Voir la facture',            en: 'View invoice' },
    CANCELLED:         { fr: 'Restaurer',                  en: 'Restore' },
    REJECTED:          { fr: 'Restaurer',                  en: 'Restore' },
    NO_SHOW:           { fr: 'Restaurer',                  en: 'Restore' },
    WAITLIST:          { fr: 'Confirmer',                  en: 'Confirm' },
    PENDING_EXTENSION: { fr: "Voir l'extension",           en: 'View extension' },
  },
};

export interface BookingActionsProps {
  bookingId: string;
  version: number;
  status: BookingStatus;
  serviceType: ServiceType;
  locale: string;
  invoiceId?: string | null;
  /** Called after a successful status transition. */
  onStatusChange?: (newStatus: BookingStatus) => void;
  /** Called when "Clôturer" is clicked (opens CloseStayDialog). */
  onCloseStay?: () => void;
}

export default function BookingActions({
  bookingId,
  version,
  status,
  serviceType,
  locale,
  invoiceId,
  onStatusChange,
  onCloseStay,
}: BookingActionsProps) {
  const fr = locale !== 'en';
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const pipeline = serviceType === 'PET_TAXI' ? 'PET_TAXI' : 'BOARDING';
  const nextMap = pipeline === 'PET_TAXI' ? PET_TAXI_NEXT : BOARDING_NEXT;
  const nextStatus: BookingStatus | undefined = nextMap[status];
  const labels = ACTION_LABELS[pipeline];

  const patch = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, version }),
      });
      if (!res.ok) throw new Error('patch failed');
      const data = (await res.json()) as { status?: BookingStatus };
      if (data.status) onStatusChange?.(data.status);
      router.refresh();
    } catch { /* errors surfaced via toast or inline */ }
    finally { setBusy(false); }
  }, [bookingId, version, onStatusChange, router]);

  const isTerminal = ['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'].includes(status);

  // IN_PROGRESS boarding → always use CloseStayDialog
  if (status === 'IN_PROGRESS' && serviceType === 'BOARDING') {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onCloseStay}
          className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {labels.IN_PROGRESS[fr ? 'fr' : 'en']}
        </button>
      </div>
    );
  }

  // COMPLETED → link to invoice
  if (status === 'COMPLETED') {
    return invoiceId ? (
      <a
        href={`/${locale}/admin/billing?invoiceId=${invoiceId}`}
        className="flex-1 block text-center px-4 py-2.5 rounded-lg border border-ivory-200 text-charcoal text-sm font-medium hover:bg-ivory-50"
      >
        {labels.COMPLETED[fr ? 'fr' : 'en']}
      </a>
    ) : null;
  }

  if (isTerminal) return null;

  return (
    <div className="flex gap-2">
      {/* Reject button — only for PENDING */}
      {status === 'PENDING' && (
        <>
          {!rejectOpen ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejectOpen(true)}
              className="px-4 py-2.5 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {fr ? 'Refuser' : 'Reject'}
            </button>
          ) : (
            <div className="flex-1 space-y-2">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={fr ? 'Raison du refus (min. 10 car.)…' : 'Rejection reason (min. 10 chars)…'}
                rows={2}
                className="w-full text-sm border border-red-200 rounded-lg px-3 py-2 resize-none"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setRejectOpen(false); setRejectReason(''); }}
                  className="px-3 py-1.5 text-sm border border-ivory-200 rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  {fr ? 'Annuler' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={rejectReason.trim().length < 10 || busy}
                  onClick={() => patch({ status: 'REJECTED', cancellationReason: rejectReason.trim() })}
                  className="flex-1 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg disabled:opacity-50"
                >
                  {fr ? 'Confirmer le refus' : 'Confirm rejection'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Primary action */}
      {!rejectOpen && nextStatus && (
        <button
          type="button"
          disabled={busy}
          onClick={() => patch({ status: nextStatus })}
          className="flex-1 px-4 py-2.5 rounded-lg bg-charcoal hover:bg-charcoal/90 text-white text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {busy ? '…' : labels[status]?.[fr ? 'fr' : 'en'] ?? status}
        </button>
      )}
    </div>
  );
}
