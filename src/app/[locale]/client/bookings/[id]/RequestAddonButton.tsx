'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, X, Car, Scissors, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

type ServiceType = 'PET_TAXI' | 'TOILETTAGE' | 'AUTRE';

interface Props {
  bookingId: string;
  locale: string;
}

const l = {
  fr: {
    cta: 'Demander un service',
    title: 'Demande de service supplémentaire',
    petTaxi: 'Pet Taxi',
    grooming: 'Toilettage',
    other: 'Autre',
    messagePlaceholder: 'Précisions (facultatif)…',
    submit: 'Envoyer la demande',
    cancel: 'Annuler',
    chooseService: 'Choisissez un service',
    success: 'Demande envoyée ! Nous vous contactons rapidement.',
    rateLimited: 'Vous avez déjà soumis plusieurs demandes, nous vous contactons bientôt.',
    notActive: 'Cette demande n\'est plus disponible sur cette réservation.',
    serverError: 'Erreur lors de l\'envoi. Veuillez réessayer.',
  },
  en: {
    cta: 'Request a service',
    title: 'Request an additional service',
    petTaxi: 'Pet Taxi',
    grooming: 'Grooming',
    other: 'Other',
    messagePlaceholder: 'Details (optional)…',
    submit: 'Send request',
    cancel: 'Cancel',
    chooseService: 'Choose a service',
    success: 'Request sent! We\'ll get back to you shortly.',
    rateLimited: 'You\'ve already submitted multiple requests, we\'ll be in touch soon.',
    notActive: 'This request is no longer available for this booking.',
    serverError: 'Error sending request. Please try again.',
  },
};

const SERVICES: { value: ServiceType; icon: typeof Car }[] = [
  { value: 'PET_TAXI',   icon: Car },
  { value: 'TOILETTAGE', icon: Scissors },
  { value: 'AUTRE',      icon: FileText },
];

export default function RequestAddonButton({ bookingId, locale }: Props) {
  const t = l[locale as keyof typeof l] || l.fr;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serviceType, setServiceType] = useState<ServiceType | ''>('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const labelFor = (s: ServiceType) =>
    s === 'PET_TAXI' ? t.petTaxi : s === 'TOILETTAGE' ? t.grooming : t.other;

  const reset = () => {
    setOpen(false);
    setServiceType('');
    setMessage('');
  };

  async function handleSubmit() {
    if (!serviceType) {
      toast({ title: t.chooseService, variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/addon-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceType, message: message.trim() || undefined }),
      });
      if (res.status === 429) {
        toast({ title: t.rateLimited, variant: 'destructive' });
        reset();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errMsg = data.error === 'BOOKING_NOT_ACTIVE' ? t.notActive : t.serverError;
        toast({ title: errMsg, variant: 'destructive' });
        return;
      }
      toast({ title: t.success, variant: 'success' });
      reset();
      router.refresh();
    } catch {
      toast({ title: t.serverError, variant: 'destructive' });
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
        <Sparkles className="h-4 w-4 mr-1.5" />
        {t.cta}
      </Button>
    );
  }

  return (
    <div className="bg-gold-50 border border-gold-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold-600" />
          <p className="text-sm font-semibold text-charcoal">{t.title}</p>
        </div>
        <button onClick={reset} className="text-gray-400 hover:text-gray-600" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {SERVICES.map(({ value, icon: Icon }) => {
          const selected = serviceType === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setServiceType(value)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs font-medium transition-colors ${
                selected
                  ? 'bg-white border-gold-400 text-charcoal ring-2 ring-gold-300'
                  : 'bg-white border-ivory-200 text-gray-600 hover:border-gold-200'
              }`}
              aria-pressed={selected}
            >
              <Icon className={`h-5 w-5 ${selected ? 'text-gold-600' : 'text-gray-400'}`} />
              <span>{labelFor(value)}</span>
            </button>
          );
        })}
      </div>

      <div>
        <textarea
          rows={2}
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={t.messagePlaceholder}
          maxLength={500}
          className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 bg-white resize-none"
        />
        <p className="text-[10px] text-gray-400 mt-0.5 text-right">{message.length}/500</p>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          className="bg-gold-600 hover:bg-gold-700 text-white"
          disabled={loading || !serviceType}
          onClick={handleSubmit}
        >
          {t.submit}
        </Button>
        <Button size="sm" variant="outline" disabled={loading} onClick={reset}>
          {t.cancel}
        </Button>
      </div>
    </div>
  );
}
