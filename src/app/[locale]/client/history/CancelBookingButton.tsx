'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  bookingId: string;
  locale: string;
}

const REASONS_FR = [
  { value: 'plans_changed', label: 'Changement de plans' },
  { value: 'emergency', label: 'Urgence personnelle' },
  { value: 'found_other', label: "J'ai trouvé une autre solution" },
  { value: 'dates_changed', label: 'Dates modifiées' },
  { value: 'price', label: 'Raison financière' },
  { value: 'other', label: 'Autre' },
];

const REASONS_EN = [
  { value: 'plans_changed', label: 'Plans changed' },
  { value: 'emergency', label: 'Personal emergency' },
  { value: 'found_other', label: 'Found another solution' },
  { value: 'dates_changed', label: 'Dates changed' },
  { value: 'price', label: 'Financial reason' },
  { value: 'other', label: 'Other' },
];

export default function CancelBookingButton({ bookingId, locale }: Props) {
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const isEn = locale === 'en';
  const reasons = isEn ? REASONS_EN : REASONS_FR;
  const l = isEn
    ? {
        btn: 'Cancel',
        title: 'Cancel this booking?',
        desc: 'This action cannot be undone. Please select a reason.',
        reasonLabel: 'Reason for cancellation',
        reasonPlaceholder: 'Select a reason...',
        no: 'Keep booking',
        yes: 'Yes, cancel',
        success: 'Booking cancelled',
        error: 'Error',
        reasonRequired: 'Please select a reason',
      }
    : {
        btn: 'Annuler',
        title: 'Annuler cette réservation ?',
        desc: 'Cette action est irréversible. Veuillez sélectionner un motif.',
        reasonLabel: "Motif d'annulation",
        reasonPlaceholder: 'Sélectionner un motif...',
        no: 'Garder',
        yes: 'Oui, annuler',
        success: 'Réservation annulée',
        error: 'Erreur',
        reasonRequired: 'Veuillez sélectionner un motif',
      };

  const handleCancel = async () => {
    if (!reason) {
      toast({ title: l.reasonRequired, variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED', cancellationReason: reason }),
      });
      if (!res.ok) throw new Error();
      toast({ title: l.success, variant: 'success' });
      setConfirm(false);
      setReason('');
      router.refresh();
    } catch {
      toast({ title: l.error, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setReason('');
    setConfirm(true);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors font-medium"
      >
        <X className="h-3 w-3" />
        {l.btn}
      </button>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
              <h2 className="text-lg font-serif font-bold text-charcoal mb-2">{l.title}</h2>
              <p className="text-sm text-gray-500">{l.desc}</p>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-medium text-charcoal mb-1.5">
                {l.reasonLabel}
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-300 bg-white text-charcoal"
              >
                <option value="">{l.reasonPlaceholder}</option>
                {reasons.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(false)}
                className="flex-1 px-4 py-2 border border-ivory-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-ivory-50"
              >
                {l.no}
              </button>
              <button
                onClick={handleCancel}
                disabled={loading || !reason}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {l.yes}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
