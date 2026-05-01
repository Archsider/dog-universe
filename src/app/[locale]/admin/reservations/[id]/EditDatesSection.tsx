'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';

interface EditDatesSectionProps {
  booking: {
    id: string;
    version: number;
    startDate: Date;
    endDate: Date | null;
    serviceType: string;
  };
  locale: string;
}

const l = {
  fr: {
    title: 'Éditer les dates',
    description: 'Modifie les dates de la réservation et régénère automatiquement le montant de la facture.',
    currentDates: 'Dates actuelles',
    newStartDate: 'Nouvelle date d\'arrivée',
    newEndDate: 'Nouvelle date de départ',
    save: 'Enregistrer',
    cancel: 'Annuler',
    nights: 'nuit(s)',
    successMsg: 'Dates mises à jour — facture recalculée.',
    errorRequired: 'Les deux dates sont requises.',
    errorEndBeforeStart: 'La date de départ doit être après la date d\'arrivée.',
    errorServer: 'Erreur lors de la mise à jour.',
  },
  en: {
    title: 'Edit dates',
    description: 'Modify booking dates and automatically regenerate the invoice amount.',
    currentDates: 'Current dates',
    newStartDate: 'New arrival date',
    newEndDate: 'New departure date',
    save: 'Save',
    cancel: 'Cancel',
    nights: 'night(s)',
    successMsg: 'Dates updated — invoice recalculated.',
    errorRequired: 'Both dates are required.',
    errorEndBeforeStart: 'Departure must be after arrival.',
    errorServer: 'Error updating dates.',
  },
};

export default function EditDatesSection({ booking, locale }: EditDatesSectionProps) {
  const router = useRouter();
  const t = l[locale as keyof typeof l] || l.fr;
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(booking.startDate.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(booking.endDate ? booking.endDate.toISOString().slice(0, 10) : '');
  const [loading, setLoading] = useState(false);

  const currentNights = booking.endDate
    ? Math.floor((booking.endDate.getTime() - booking.startDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const previewNights = startDate && endDate
    ? Math.max(0, Math.floor((new Date(endDate + 'T12:00:00Z').getTime() - new Date(startDate + 'T12:00:00Z').getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  async function handleSave() {
    if (!startDate || !endDate) {
      toast({ title: t.errorRequired, variant: 'destructive' });
      return;
    }
    if (endDate <= startDate) {
      toast({ title: t.errorEndBeforeStart, variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editDates: { startDate, endDate }, version: booking.version }),
      });
      const data = await res.json();
      if (res.status === 409) {
        toast({
          title: locale === 'fr'
            ? 'Cette réservation a été modifiée par quelqu\'un d\'autre. Veuillez rafraîchir.'
            : 'This record was modified by someone else. Please refresh.',
          variant: 'destructive',
        });
        return;
      }
      if (!res.ok) {
        toast({ title: data.error ?? t.errorServer, variant: 'destructive' });
        return;
      }
      toast({ title: t.successMsg });
      setOpen(false);
      router.refresh();
    } catch {
      toast({ title: t.errorServer, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card space-y-3">
      <button
        className="flex items-center justify-between w-full"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gold-500" />
          <h3 className="font-semibold text-charcoal text-sm">{t.title}</h3>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {open && (
        <div className="space-y-4 pt-1">
          <p className="text-xs text-gray-500">{t.description}</p>

          {/* Current dates */}
          <div className="text-xs text-gray-500 bg-ivory-50 rounded-lg px-3 py-2 space-y-1">
            <p className="font-medium text-gray-600">{t.currentDates}</p>
            <p>
              {formatDate(booking.startDate, locale)}
              {booking.endDate ? ` → ${formatDate(booking.endDate, locale)}` : ''}
              {currentNights !== null && (
                <span className="text-gray-400 ml-1">({currentNights} {t.nights})</span>
              )}
            </p>
          </div>

          {/* New start date */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">{t.newStartDate}</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
            />
          </div>

          {/* New end date */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">{t.newEndDate}</label>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={e => setEndDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
            />
          </div>

          {/* Preview nights */}
          {previewNights !== null && previewNights > 0 && (
            <p className="text-xs text-gray-500">
              {locale === 'fr' ? 'Nouvelle durée' : 'New duration'} :{' '}
              <span className="font-semibold text-charcoal">{previewNights} {t.nights}</span>
            </p>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-charcoal hover:bg-charcoal/90 text-white"
              disabled={loading || !startDate || !endDate || endDate <= startDate}
              onClick={handleSave}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {t.save}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => {
                setOpen(false);
                setStartDate(booking.startDate.toISOString().slice(0, 10));
                setEndDate(booking.endDate ? booking.endDate.toISOString().slice(0, 10) : '');
              }}
            >
              {t.cancel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
