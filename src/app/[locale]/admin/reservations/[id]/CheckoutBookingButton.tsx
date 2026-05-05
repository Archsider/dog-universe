'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface CheckoutBookingButtonProps {
  bookingId: string;
  locale: string;
}

function nowLocalForInput(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16); // yyyy-MM-ddTHH:mm
}

export default function CheckoutBookingButton({ bookingId, locale }: CheckoutBookingButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [endDate, setEndDate] = useState(nowLocalForInput());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = (fr: string, en: string) => (locale === 'en' ? en : fr);

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      const iso = new Date(endDate).toISOString();
      const res = await fetch(`/api/admin/bookings/${bookingId}/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endDate: iso }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'ERROR');
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      const code = err instanceof Error ? err.message : 'ERROR';
      setError(
        code === 'END_BEFORE_START'
          ? t('La date doit être après le début du séjour', 'End must be after start')
          : code === 'NOT_OPEN_ENDED'
          ? t("Ce séjour n'est pas ouvert", 'Booking is not open-ended')
          : t('Échec de la clôture', 'Checkout failed'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-emerald-200 p-5 shadow-card">
      <h3 className="font-semibold text-charcoal mb-1 text-sm flex items-center gap-2">
        <span>🏁</span>
        {t('Clôturer le séjour', 'Check out the stay')}
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        {t(
          'Définit la date/heure de sortie réelle, recalcule la facture et marque le séjour comme terminé.',
          'Sets the real exit datetime, recomputes the invoice and marks the stay as completed.',
        )}
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
        >
          {t('Clôturer le séjour', 'Check out')}
        </button>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs text-gray-600">
            {t('Date et heure de sortie', 'Exit date & time')}
          </label>
          <input
            type="datetime-local"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full border border-ivory-200 rounded-md px-2 py-1.5 text-sm"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={submitting}
              className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm disabled:opacity-50"
            >
              {submitting ? t('…', '…') : t('Confirmer', 'Confirm')}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="px-3 py-1.5 rounded-md border border-ivory-200 text-sm"
            >
              {t('Annuler', 'Cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
