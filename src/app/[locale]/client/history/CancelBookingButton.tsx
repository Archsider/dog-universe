'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  bookingId: string;
  locale: string;
}

export default function CancelBookingButton({ bookingId, locale }: Props) {
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const l = locale === 'en'
    ? { btn: 'Cancel', title: 'Cancel this booking?', desc: 'This action cannot be undone. The booking will be marked as cancelled.', no: 'Keep booking', yes: 'Yes, cancel', success: 'Booking cancelled', error: 'Error' }
    : { btn: 'Annuler', title: 'Annuler cette réservation ?', desc: 'Cette action est irréversible. La réservation sera marquée comme annulée.', no: 'Garder', yes: 'Oui, annuler', success: 'Réservation annulée', error: 'Erreur' };

  const handleCancel = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      if (!res.ok) throw new Error();
      toast({ title: l.success, variant: 'success' });
      setConfirm(false);
      router.refresh();
    } catch {
      toast({ title: l.error, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setConfirm(true)}
        className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors font-medium"
      >
        <X className="h-3 w-3" />
        {l.btn}
      </button>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <h2 className="text-lg font-serif font-bold text-charcoal mb-2">{l.title}</h2>
            <p className="text-sm text-gray-500 mb-6">{l.desc}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(false)}
                className="flex-1 px-4 py-2 border border-ivory-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-ivory-50"
              >
                {l.no}
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
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
