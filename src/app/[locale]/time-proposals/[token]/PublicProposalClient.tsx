'use client';

import { useState } from 'react';
import { CheckCircle2, X, Loader2 } from 'lucide-react';

interface Props {
  locale: string;
  token: string;
  proposal: {
    time: string;
    scopeLabel: string;
    petName: string;
    proposalNote: string | null;
  };
}

type State = 'idle' | 'submitting' | 'accepted' | 'rejected' | 'error';

export function PublicProposalClient({ locale, token, proposal }: Props) {
  const fr = locale === 'fr';
  const [state, setState] = useState<State>('idle');
  const [rejectingNote, setRejectingNote] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setError(null);
    setState('submitting');
    try {
      const res = await fetch(`/api/time-proposals/${token}/accept`, { method: 'POST' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `HTTP ${res.status}`);
        setState('error');
        return;
      }
      setState('accepted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'NETWORK_ERROR');
      setState('error');
    }
  }

  async function reject() {
    if (rejectingNote.trim().length < 10) {
      setError(fr ? 'Merci de préciser un motif (≥ 10 caractères)' : 'Please provide a reason (≥ 10 chars)');
      return;
    }
    setError(null);
    setState('submitting');
    try {
      const res = await fetch(`/api/time-proposals/${token}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: rejectingNote.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `HTTP ${res.status}`);
        setState('error');
        return;
      }
      setState('rejected');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'NETWORK_ERROR');
      setState('error');
    }
  }

  if (state === 'accepted') {
    return (
      <div className="max-w-md w-full bg-white rounded-2xl shadow-card p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <h1 className="text-xl font-bold text-charcoal mb-2">
          {fr ? 'Heure confirmée ✓' : 'Time confirmed ✓'}
        </h1>
        <p className="text-sm text-gray-600">
          {fr
            ? `Votre ${proposal.scopeLabel} est désormais confirmée à ${proposal.time}. À bientôt !`
            : `Your ${proposal.scopeLabel} is now confirmed at ${proposal.time}. See you soon!`}
        </p>
      </div>
    );
  }

  if (state === 'rejected') {
    return (
      <div className="max-w-md w-full bg-white rounded-2xl shadow-card p-6 text-center">
        <p className="text-5xl mb-3" aria-hidden="true">📩</p>
        <h1 className="text-xl font-bold text-charcoal mb-2">
          {fr ? 'Refus enregistré' : 'Rejection recorded'}
        </h1>
        <p className="text-sm text-gray-600">
          {fr
            ? "Notre équipe vous proposera une nouvelle heure dès que possible."
            : 'Our team will propose a new time as soon as possible.'}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md w-full bg-white rounded-2xl shadow-card p-6">
      <div className="text-center mb-6">
        <p className="text-5xl mb-3" aria-hidden="true">⏰</p>
        <h1 className="text-xl font-bold text-charcoal mb-1">
          {fr ? 'Heure proposée par Dog Universe' : 'Time proposed by Dog Universe'}
        </h1>
        <p className="text-sm text-gray-500">
          {fr ? 'Merci de confirmer ou de nous indiquer si cela ne convient pas.' : 'Please confirm or let us know if this does not suit you.'}
        </p>
      </div>

      <dl className="space-y-3 mb-6">
        <div className="flex items-baseline justify-between border-b border-[#F0D98A]/30 pb-2">
          <dt className="text-xs text-gray-500 uppercase tracking-wider">{fr ? 'Animal' : 'Pet'}</dt>
          <dd className="text-sm font-medium text-charcoal">{proposal.petName}</dd>
        </div>
        <div className="flex items-baseline justify-between border-b border-[#F0D98A]/30 pb-2">
          <dt className="text-xs text-gray-500 uppercase tracking-wider">{fr ? 'Concerne' : 'Scope'}</dt>
          <dd className="text-sm font-medium text-charcoal">{proposal.scopeLabel}</dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-xs text-gray-500 uppercase tracking-wider">{fr ? 'Heure proposée' : 'Proposed time'}</dt>
          <dd className="text-2xl font-bold text-[#C4974A] tabular-nums">{proposal.time}</dd>
        </div>
        {proposal.proposalNote && (
          <div className="bg-[#FBF5E0] border border-[#E2C048]/30 rounded-lg p-3 mt-3">
            <p className="text-xs text-charcoal italic">{proposal.proposalNote}</p>
          </div>
        )}
      </dl>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>
      )}

      {!showRejectForm ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={accept}
            disabled={state === 'submitting'}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {state === 'submitting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {fr ? `Accepter ${proposal.time}` : `Accept ${proposal.time}`}
          </button>
          <button
            type="button"
            onClick={() => setShowRejectForm(true)}
            disabled={state === 'submitting'}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            {fr ? 'Cette heure ne me convient pas' : "This time doesn't suit me"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-charcoal">
            {fr ? 'Indiquez-nous pourquoi (≥ 10 caractères)' : 'Tell us why (≥ 10 chars)'}
          </label>
          <textarea
            value={rejectingNote}
            onChange={(e) => setRejectingNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={fr ? 'Ex : 10h c\'est trop tôt pour moi…' : 'E.g. 10am is too early for me…'}
            className="w-full px-3 py-2 rounded-lg border border-[#E2C048]/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowRejectForm(false); setRejectingNote(''); setError(null); }}
              disabled={state === 'submitting'}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
            >
              {fr ? 'Annuler' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={reject}
              disabled={state === 'submitting'}
              className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-40"
            >
              {state === 'submitting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              {fr ? 'Envoyer le refus' : 'Send rejection'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
