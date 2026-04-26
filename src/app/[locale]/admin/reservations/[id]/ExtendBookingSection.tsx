'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Check, X, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';

interface ExtendBookingSectionProps {
  booking: {
    id: string;
    startDate: Date;
    endDate: Date | null;
    totalPrice: number;
    hasExtensionRequest: boolean;
    extensionRequestedEndDate: Date | null;
    extensionRequestNote: string | null;
  };
  locale: string;
}

const l = {
  fr: {
    title: 'Prolongation de séjour',
    pendingRequest: 'Demande de prolongation client',
    requestedDate: 'Date souhaitée',
    clientNote: 'Note du client',
    approve: 'Approuver',
    reject: 'Refuser',
    directExtend: 'Prolonger directement',
    newEndDate: 'Nouvelle date de départ',
    apply: 'Appliquer',
    cancel: 'Annuler',
    nights: 'nuit(s)',
    newTotal: 'Nouveau total estimé',
    invoiceWarning: 'La facture est déjà payée — le supplément doit être géré manuellement.',
    successExtended: 'Séjour prolongé avec succès.',
    successRejected: 'Demande refusée.',
    errorRequired: 'Sélectionnez une date de départ.',
    errorMustBeLater: 'La nouvelle date doit être postérieure à la date actuelle.',
  },
  en: {
    title: 'Stay extension',
    pendingRequest: 'Client extension request',
    requestedDate: 'Requested date',
    clientNote: 'Client note',
    approve: 'Approve',
    reject: 'Decline',
    directExtend: 'Extend directly',
    newEndDate: 'New checkout date',
    apply: 'Apply',
    cancel: 'Cancel',
    nights: 'night(s)',
    newTotal: 'Estimated new total',
    invoiceWarning: 'Invoice already paid — the surcharge must be handled manually.',
    successExtended: 'Stay extended successfully.',
    successRejected: 'Request declined.',
    errorRequired: 'Please select a checkout date.',
    errorMustBeLater: 'New date must be after the current checkout date.',
  },
};

export default function ExtendBookingSection({ booking, locale }: ExtendBookingSectionProps) {
  const router = useRouter();
  const t = l[locale as keyof typeof l] || l.fr;
  const [showDirectForm, setShowDirectForm] = useState(false);
  const [newEndDate, setNewEndDate] = useState('');
  const [loading, setLoading] = useState(false);

  const currentEndDate = booking.endDate;
  const minDate = currentEndDate
    ? new Date(currentEndDate.getTime() + 86400000).toISOString().slice(0, 10)
    : new Date(booking.startDate.getTime() + 86400000).toISOString().slice(0, 10);

  async function applyExtension(opts: { extendEndDate?: string; approveExtension?: boolean; rejectExtension?: boolean }) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? 'Erreur', variant: 'destructive' });
        return;
      }
      if (opts.rejectExtension) {
        toast({ title: t.successRejected });
      } else {
        toast({ title: t.successExtended });
        if (data.invoiceWarning) {
          toast({ title: t.invoiceWarning, variant: 'destructive' });
        }
      }
      setShowDirectForm(false);
      setNewEndDate('');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  function handleDirectSubmit() {
    if (!newEndDate) { toast({ title: t.errorRequired, variant: 'destructive' }); return; }
    if (currentEndDate && new Date(newEndDate) <= currentEndDate) {
      toast({ title: t.errorMustBeLater, variant: 'destructive' }); return;
    }
    applyExtension({ extendEndDate: newEndDate });
  }

  // Estimate nights for display only (no real price fetch — shown after server recalc)
  const estimatedNights = newEndDate
    ? Math.floor((new Date(newEndDate + 'T12:00:00').getTime() - booking.startDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const requestedNights = booking.extensionRequestedEndDate
    ? Math.floor((booking.extensionRequestedEndDate.getTime() - booking.startDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card space-y-4">
      <div className="flex items-center gap-2">
        <CalendarPlus className="h-4 w-4 text-gold-500" />
        <h3 className="font-semibold text-charcoal text-sm">{t.title}</h3>
      </div>

      {/* Pending client request */}
      {booking.hasExtensionRequest && booking.extensionRequestedEndDate && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm font-semibold text-amber-800">{t.pendingRequest}</p>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">{t.requestedDate}</span>
              <span className="font-medium text-charcoal">
                {formatDate(booking.extensionRequestedEndDate, locale)}
                {requestedNights !== null && (
                  <span className="text-gray-400 ml-1">({requestedNights} {t.nights})</span>
                )}
              </span>
            </div>
            {booking.extensionRequestNote && (
              <div>
                <span className="text-gray-500 text-xs">{t.clientNote}</span>
                <p className="text-charcoal italic mt-0.5">{booking.extensionRequestNote}</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={loading}
              onClick={() => applyExtension({ approveExtension: true })}
            >
              <Check className="h-3.5 w-3.5 mr-1" />{t.approve}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-200 text-red-600 hover:bg-red-50"
              disabled={loading}
              onClick={() => applyExtension({ rejectExtension: true })}
            >
              <X className="h-3.5 w-3.5 mr-1" />{t.reject}
            </Button>
          </div>
        </div>
      )}

      {/* Direct extension */}
      <div>
        <button
          className="flex items-center gap-1.5 text-sm text-gold-600 hover:text-gold-700 font-medium"
          onClick={() => setShowDirectForm(v => !v)}
        >
          {showDirectForm ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {t.directExtend}
        </button>

        {showDirectForm && (
          <div className="mt-3 space-y-3">
            <div className="text-xs text-gray-500">
              {locale === 'fr' ? 'Date actuelle' : 'Current checkout'} :{' '}
              <span className="font-medium text-charcoal">
                {currentEndDate ? formatDate(currentEndDate, locale) : '—'}
              </span>
              {currentEndDate && (
                <span className="ml-1">
                  ({Math.floor((currentEndDate.getTime() - booking.startDate.getTime()) / 86400000)} {t.nights})
                </span>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">{t.newEndDate}</label>
              <input
                type="date"
                min={minDate}
                value={newEndDate}
                onChange={e => setNewEndDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              />
            </div>

            {estimatedNights !== null && estimatedNights > 0 && (
              <div className="text-xs text-gray-500">
                {locale === 'fr' ? 'Nouvelle durée' : 'New duration'} :{' '}
                <span className="font-medium text-charcoal">{estimatedNights} {t.nights}</span>
                <span className="ml-2 text-gray-400">
                  ({locale === 'fr' ? 'prix recalculé au moment de l\'application' : 'price recalculated on apply'})
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-charcoal hover:bg-charcoal/90 text-white"
                disabled={loading || !newEndDate}
                onClick={handleDirectSubmit}
              >
                {t.apply}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => { setShowDirectForm(false); setNewEndDate(''); }}
              >
                {t.cancel}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
