'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarRange, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { AvailabilityCalendar } from '@/components/shared/AvailabilityCalendar';

interface Props {
  bookingId: string;
  serviceType: 'BOARDING' | 'PET_TAXI';
  species: 'DOG' | 'CAT' | null;
  currentStart: string;
  currentEnd: string | null;
  locale: string;
}

const l = {
  fr: {
    title: 'Demander un changement de dates',
    request: 'Demander un changement de dates',
    newStart: 'Nouvelle date d\'arrivée *',
    newEnd: 'Nouvelle date de départ *',
    newScheduled: 'Nouvelle date du transport *',
    note: 'Note (facultatif)',
    notePlaceholder: 'Précisez la raison du changement…',
    submit: 'Envoyer la demande',
    cancel: 'Annuler',
    success: 'Demande envoyée — l\'équipe vous répondra rapidement.',
    errMissing: 'Sélectionnez les nouvelles dates.',
    errOrder: 'La date de départ doit être après la date d\'arrivée.',
    errServer: 'Erreur lors de l\'envoi. Veuillez réessayer.',
    info: 'Votre réservation repassera en attente de validation.',
  },
  en: {
    title: 'Request date change',
    request: 'Request date change',
    newStart: 'New check-in date *',
    newEnd: 'New check-out date *',
    newScheduled: 'New transport date *',
    note: 'Note (optional)',
    notePlaceholder: 'Reason for the change…',
    submit: 'Send request',
    cancel: 'Cancel',
    success: 'Request sent — our team will get back to you shortly.',
    errMissing: 'Select the new dates.',
    errOrder: 'Check-out must be after check-in.',
    errServer: 'Error sending request. Please try again.',
    info: 'Your booking will return to pending validation.',
  },
};

export default function RescheduleBookingButton({
  bookingId, serviceType, species, locale,
}: Props) {
  const router = useRouter();
  const t = l[locale as keyof typeof l] || l.fr;
  const [open, setOpen] = useState(false);
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [newScheduled, setNewScheduled] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  async function handleSubmit() {
    const body: Record<string, string> = {};
    if (serviceType === 'BOARDING') {
      if (!newStart || !newEnd) { toast({ title: t.errMissing, variant: 'destructive' }); return; }
      if (newEnd <= newStart) { toast({ title: t.errOrder, variant: 'destructive' }); return; }
      body.requestedStartDate = new Date(newStart).toISOString();
      body.requestedEndDate = new Date(newEnd).toISOString();
    } else {
      if (!newScheduled) { toast({ title: t.errMissing, variant: 'destructive' }); return; }
      body.requestedScheduledAt = new Date(newScheduled).toISOString();
    }
    if (note.trim()) body.rescheduleNote = note.trim();

    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: data.error ?? t.errServer, variant: 'destructive' });
        return;
      }
      toast({ title: t.success });
      setOpen(false);
      setNewStart(''); setNewEnd(''); setNewScheduled(''); setNote('');
      router.refresh();
    } catch {
      toast({ title: t.errServer, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="border-amber-300 text-amber-700 hover:bg-amber-50"
        onClick={() => setOpen(true)}
      >
        <CalendarRange className="h-4 w-4 mr-1.5" />
        {t.request}
      </Button>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-amber-600" />
          <p className="text-sm font-semibold text-amber-800">{t.title}</p>
        </div>
        <button onClick={() => setOpen(false)} aria-label={t.cancel} className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-400 rounded">
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="text-xs text-amber-700">{t.info}</p>

      {serviceType === 'BOARDING' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">{t.newStart}</label>
              <input
                type="date" min={today} value={newStart}
                onChange={e => setNewStart(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">{t.newEnd}</label>
              <input
                type="date" min={newStart || today} value={newEnd}
                onChange={e => setNewEnd(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
              />
            </div>
          </div>
          {species && (
            <AvailabilityCalendar
              species={species}
              selectedStart={newStart || null}
              selectedEnd={newEnd || null}
              interactive={false}
            />
          )}
        </>
      ) : (
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">{t.newScheduled}</label>
          <input
            type="datetime-local" min={`${today}T10:00`}
            value={newScheduled}
            onChange={e => setNewScheduled(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          />
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">{t.note}</label>
        <textarea
          rows={2} value={note} onChange={e => setNote(e.target.value)}
          placeholder={t.notePlaceholder} maxLength={500}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white resize-none"
        />
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          className="bg-amber-600 hover:bg-amber-700 text-white"
          disabled={loading}
          onClick={handleSubmit}
        >
          {t.submit}
        </Button>
        <Button size="sm" variant="outline" disabled={loading}
          onClick={() => { setOpen(false); }}>
          {t.cancel}
        </Button>
      </div>
    </div>
  );
}
