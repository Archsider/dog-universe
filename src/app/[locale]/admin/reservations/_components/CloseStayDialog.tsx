'use client';

// Reusable close-stay modal. Used from:
//   - Today view → "Départs" section (one-click clôture)
//   - In-Progress view → inline clôture
//   - Booking detail page (legacy CheckoutBookingButton wraps the same API)
//
// Flow:
//   isOpenEnded → admin picks endDate, live total recomputes (pension price × nights × pets)
//   normal stay → endDate readonly, totalPrice readonly (already known)
// On confirm: POST /api/admin/bookings/[id]/checkout { endDate: ISO }
// Server recalculates BOARDING items and sets status=COMPLETED.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMAD } from '@/lib/utils';
import { getPensionPriceNumber, type PricingSettings } from '@/lib/pricing-rules';

type Pet = { id: string; name: string; species: 'DOG' | 'CAT' };

type Props = {
  open: boolean;
  onClose: () => void;
  booking: {
    id: string;
    clientName: string;
    pets: Pet[];
    startDate: string;
    endDate: string | null;
    isOpenEnded: boolean;
    totalPrice: number;
  };
  pricing: PricingSettings;
  locale: string;
  onSuccess?: () => void;
};

function nowLocalForInput(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

function nightsBetween(startISO: string, endISO: string): number {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  return Math.max(1, Math.ceil((end - start) / 86_400_000));
}

function computeLiveTotal(pets: Pet[], nights: number, pricing: PricingSettings): number {
  const dogs = pets.filter((x) => x.species === 'DOG').length;
  return pets.reduce(
    (acc, pet) => acc + getPensionPriceNumber({ species: pet.species }, dogs, nights, pricing) * nights,
    0,
  );
}

export default function CloseStayDialog({ open, onClose, booking, pricing, locale, onSuccess }: Props) {
  const fr = locale !== 'en';
  const router = useRouter();
  const [endDate, setEndDate] = useState<string>(() =>
    booking.endDate
      ? new Date(booking.endDate).toISOString().slice(0, 16)
      : nowLocalForInput(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setEndDate(
        booking.endDate
          ? new Date(booking.endDate).toISOString().slice(0, 16)
          : nowLocalForInput(),
      );
    }
  }, [open, booking.endDate]);

  const nights = useMemo(() => nightsBetween(booking.startDate, endDate), [booking.startDate, endDate]);
  const liveTotal = useMemo(() => {
    if (!booking.isOpenEnded) return booking.totalPrice;
    return computeLiveTotal(booking.pets, nights, pricing);
  }, [booking.isOpenEnded, booking.totalPrice, booking.pets, nights, pricing]);

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      const iso = new Date(endDate).toISOString();
      const res = await fetch(`/api/admin/bookings/${booking.id}/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endDate: iso }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'ERROR');
      }
      onSuccess?.();
      onClose();
      router.refresh();
    } catch (err) {
      const code = err instanceof Error ? err.message : 'ERROR';
      setError(
        code === 'END_BEFORE_START'
          ? fr ? 'La date doit être après le début du séjour' : 'End must be after start'
          : code === 'NOT_OPEN_ENDED'
          ? booking.isOpenEnded
            ? fr ? 'Erreur d\'état' : 'State error'
            : fr ? 'Ce séjour n\'est pas ouvert' : 'Stay is not open-ended'
          : fr ? 'Échec de la clôture' : 'Checkout failed',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2 className="text-lg font-semibold text-charcoal">
            {fr ? 'Clôturer le séjour' : 'Close the stay'}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {fr
              ? 'Fige la date de sortie, recalcule la facture et passe le statut à Terminé.'
              : 'Locks the exit date, recomputes the invoice and marks the stay completed.'}
          </p>
        </header>

        <div className="rounded-lg bg-ivory-50 p-3 text-sm space-y-1">
          <p className="font-medium text-charcoal">{booking.clientName}</p>
          <p className="text-xs text-gray-600">
            {booking.pets.map((p) => `${p.name} (${p.species === 'CAT' ? '🐱' : '🐶'})`).join(' · ')}
          </p>
          <p className="text-xs text-gray-500">
            {fr ? 'Arrivée :' : 'Arrival:'} {new Date(booking.startDate).toLocaleDateString(fr ? 'fr-MA' : 'en-GB')}
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {fr ? 'Date et heure de sortie' : 'Exit date & time'}
          </label>
          <input
            type="datetime-local"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={!booking.isOpenEnded || submitting}
            className="w-full border border-ivory-200 rounded-md px-3 py-2 text-sm disabled:bg-ivory-50 disabled:text-gray-500"
          />
          {!booking.isOpenEnded && (
            <p className="text-xs text-gray-400 mt-1">
              {fr ? 'Date connue à la réservation — non modifiable.' : 'Locked at booking — not editable.'}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-amber-800 font-medium">
              {fr ? 'Total final' : 'Final total'}
            </span>
            <span className="text-xl font-bold text-amber-900">{formatMAD(liveTotal)}</span>
          </div>
          {booking.isOpenEnded && (
            <p className="text-xs text-amber-700 mt-1">
              {fr ? `${nights} nuit${nights > 1 ? 's' : ''} × tarif pension` : `${nights} night${nights > 1 ? 's' : ''} × pension rate`}
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <footer className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-md border border-ivory-200 text-sm text-gray-700 hover:bg-ivory-50"
          >
            {fr ? 'Annuler' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={submitting}
            className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? (fr ? '…' : '…') : fr ? 'Confirmer la clôture' : 'Confirm checkout'}
          </button>
        </footer>
      </div>
    </div>
  );
}
