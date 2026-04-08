'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

interface RequestExtensionButtonProps {
  bookingId: string;
  currentEndDate: Date;
  hasExtensionRequest: boolean;
  locale: string;
}

const l = {
  fr: {
    requestExtension: 'Demander une prolongation',
    pending: 'Prolongation en attente de validation',
    newEndDate: 'Nouvelle date de départ souhaitée *',
    note: 'Note (facultatif)',
    notePlaceholder: 'Raison de la prolongation…',
    submit: 'Envoyer la demande',
    cancel: 'Annuler',
    successMsg: 'Demande envoyée — l\'équipe vous répondra rapidement.',
    errorRequired: 'Sélectionnez une date de départ.',
    errorMustBeLater: 'La nouvelle date doit être postérieure à la date actuelle.',
    errorServer: 'Erreur lors de l\'envoi. Veuillez réessayer.',
  },
  en: {
    requestExtension: 'Request extension',
    pending: 'Extension request pending',
    newEndDate: 'New requested checkout date *',
    note: 'Note (optional)',
    notePlaceholder: 'Reason for the extension…',
    submit: 'Send request',
    cancel: 'Cancel',
    successMsg: 'Request sent — our team will get back to you shortly.',
    errorRequired: 'Please select a checkout date.',
    errorMustBeLater: 'New date must be after the current checkout date.',
    errorServer: 'Error sending request. Please try again.',
  },
};

export default function RequestExtensionButton({ bookingId, currentEndDate, hasExtensionRequest, locale }: RequestExtensionButtonProps) {
  const router = useRouter();
  const t = l[locale as keyof typeof l] || l.fr;
  const [open, setOpen] = useState(false);
  const [requestedEndDate, setRequestedEndDate] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const minDate = new Date(currentEndDate.getTime() + 86400000).toISOString().slice(0, 10);

  if (hasExtensionRequest) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
        <Clock className="h-4 w-4 flex-shrink-0" />
        <span className="font-medium">{t.pending}</span>
      </div>
    );
  }

  async function handleSubmit() {
    if (!requestedEndDate) { toast({ title: t.errorRequired, variant: 'destructive' }); return; }
    if (new Date(requestedEndDate) <= currentEndDate) {
      toast({ title: t.errorMustBeLater, variant: 'destructive' }); return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/extension-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedEndDate, note: note || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: data.error ?? t.errorServer, variant: 'destructive' });
        return;
      }
      toast({ title: t.successMsg });
      setOpen(false);
      setRequestedEndDate('');
      setNote('');
      router.refresh();
    } catch {
      toast({ title: t.errorServer, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="border-gold-200 text-gold-700 hover:bg-gold-50"
        onClick={() => setOpen(true)}
      >
        <CalendarPlus className="h-4 w-4 mr-1.5" />
        {t.requestExtension}
      </Button>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarPlus className="h-4 w-4 text-amber-600" />
          <p className="text-sm font-semibold text-amber-800">{t.requestExtension}</p>
        </div>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">{t.newEndDate}</label>
        <input
          type="date"
          min={minDate}
          value={requestedEndDate}
          onChange={e => setRequestedEndDate(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 bg-white"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">{t.note}</label>
        <textarea
          rows={2}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={t.notePlaceholder}
          maxLength={500}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 bg-white resize-none"
        />
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          className="bg-amber-600 hover:bg-amber-700 text-white"
          disabled={loading || !requestedEndDate}
          onClick={handleSubmit}
        >
          {t.submit}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => { setOpen(false); setRequestedEndDate(''); setNote(''); }}
        >
          {t.cancel}
        </Button>
      </div>
    </div>
  );
}
