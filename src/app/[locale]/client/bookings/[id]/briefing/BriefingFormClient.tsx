'use client';

// Pre-stay briefing form — 6 short fields the client fills J-2 before
// boarding to help the team prep the welcome.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import type { BriefingForm } from '@/lib/pre-stay-briefing';

interface Props {
  bookingId: string;
  locale: string;
  petName: string;
  startDate: string;
  initialForm: BriefingForm;
  submittedAt: string | null;
  canEdit: boolean;
}

const FIELDS: { key: keyof BriefingForm; max: number; rows: number }[] = [
  { key: 'food',       max: 2000, rows: 2 },
  { key: 'toys',       max: 2000, rows: 2 },
  { key: 'fears',      max: 2000, rows: 2 },
  { key: 'routine',    max: 2000, rows: 2 },
  { key: 'vetContact', max: 500,  rows: 2 },
  { key: 'freeText',   max: 4000, rows: 3 },
];

const LABELS_FR: Record<keyof BriefingForm, { label: string; placeholder: string }> = {
  food:       { label: 'Alimentation', placeholder: 'Marque, fréquence, gamelle préférée…' },
  toys:       { label: 'Jouets / Doudou', placeholder: 'Doudou indispensable ? Jouet favori ?' },
  fears:      { label: 'Peurs / Stress', placeholder: 'Bruits forts, autres chiens, séparation…' },
  routine:    { label: 'Routine quotidienne', placeholder: 'Sieste de l\'après-midi, balade du soir…' },
  vetContact: { label: 'Vétérinaire (en cas d\'urgence)', placeholder: 'Nom du véto, téléphone' },
  freeText:   { label: 'Autres infos', placeholder: 'Tout ce qu\'on devrait savoir.' },
};

const LABELS_EN: Record<keyof BriefingForm, { label: string; placeholder: string }> = {
  food:       { label: 'Food', placeholder: 'Brand, frequency, favorite bowl…' },
  toys:       { label: 'Toys / Comfort', placeholder: 'A comfort toy? Favorite ball?' },
  fears:      { label: 'Fears / Stress', placeholder: 'Loud noises, other dogs, separation…' },
  routine:    { label: 'Daily routine', placeholder: 'Afternoon nap, evening walk…' },
  vetContact: { label: 'Vet (in case of emergency)', placeholder: 'Vet name, phone number' },
  freeText:   { label: 'Other notes', placeholder: 'Anything else we should know.' },
};

export default function BriefingFormClient(props: Props) {
  const fr = props.locale === 'fr';
  const router = useRouter();
  const labels = fr ? LABELS_FR : LABELS_EN;
  const [form, setForm] = useState<BriefingForm>(props.initialForm);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [submittedAt, setSubmittedAt] = useState<string | null>(props.submittedAt);

  const startDateLong = new Date(props.startDate).toLocaleDateString(fr ? 'fr-FR' : 'en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!props.canEdit) return;
    setState('saving');
    setErrorMsg('');
    try {
      const r = await fetch(`/api/client/bookings/${props.bookingId}/briefing`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) {
        setState('error');
        setErrorMsg(j.error ?? (fr ? 'Erreur — réessayez.' : 'Error — please retry.'));
        return;
      }
      setSubmittedAt(j.submittedAt);
      setState('saved');
      setTimeout(() => setState('idle'), 3000);
    } catch {
      setState('error');
      setErrorMsg(fr ? 'Erreur réseau.' : 'Network error.');
    }
  }

  return (
    <div>
      <Link
        href={`/${props.locale}/client/bookings/${props.bookingId}`}
        className="inline-flex items-center gap-1 text-sm text-charcoal/60 hover:text-charcoal mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        {fr ? 'Retour à la réservation' : 'Back to booking'}
      </Link>

      <div className="bg-gradient-to-br from-[#FFF9E8] to-white border border-[#C9A84C]/40 rounded-2xl p-5 mb-5">
        <h1 className="text-2xl font-serif font-bold text-charcoal mb-2">
          {fr ? `Préparons le séjour de ${props.petName}` : `Let's prepare ${props.petName}'s stay`}
        </h1>
        <p className="text-sm text-charcoal/70">
          {fr
            ? `Arrivée prévue le ${startDateLong}. 2 minutes pour qu'on soit fin prêts à l'accueillir.`
            : `Arrival on ${startDateLong}. 2 minutes so we're fully ready.`}
        </p>
      </div>

      {submittedAt && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 mb-4 flex items-start gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">
              {fr ? 'Briefing reçu' : 'Briefing received'}
            </p>
            <p className="text-xs text-emerald-800 mt-0.5">
              {fr
                ? `L'équipe a bien reçu vos infos. Vous pouvez les modifier jusqu'à l'arrivée.`
                : `The team has received your notes. You can edit them until arrival.`}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        {FIELDS.map(({ key, max, rows }) => (
          <div key={key}>
            <label className="block text-sm font-semibold text-charcoal mb-1">
              {labels[key].label}
              <span className="text-charcoal/40 ml-1.5 font-normal">
                ({(form[key] ?? '').length}/{max})
              </span>
            </label>
            <textarea
              value={form[key] ?? ''}
              onChange={(e) => setForm(prev => ({ ...prev, [key]: e.target.value.slice(0, max) }))}
              placeholder={labels[key].placeholder}
              rows={rows}
              maxLength={max}
              disabled={!props.canEdit}
              className="w-full text-sm border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
        ))}

        {errorMsg && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {errorMsg}
          </div>
        )}

        {props.canEdit ? (
          <button
            type="submit"
            disabled={state === 'saving'}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#C9A84C] hover:bg-[#B8960C] disabled:opacity-60 text-white font-medium transition-colors"
          >
            {state === 'saving' && <Loader2 className="h-4 w-4 animate-spin" />}
            {state === 'saved' && <CheckCircle2 className="h-4 w-4" />}
            {state === 'saving'
              ? (fr ? 'Envoi…' : 'Sending…')
              : state === 'saved'
                ? (fr ? '✓ Enregistré' : '✓ Saved')
                : submittedAt
                  ? (fr ? 'Mettre à jour' : 'Update')
                  : (fr ? 'Envoyer le briefing' : 'Send briefing')}
          </button>
        ) : (
          <p className="text-sm text-center text-charcoal/50 italic">
            {fr ? 'Ce briefing n\'est plus modifiable.' : 'This briefing is no longer editable.'}
          </p>
        )}
      </form>
    </div>
  );
}
