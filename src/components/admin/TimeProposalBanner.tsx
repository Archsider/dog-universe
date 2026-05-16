'use client';

// Admin-side banner : surfaces the current state of the time confirmation
// negotiation for a given booking. Shown on the reservation detail page.
//
// 3 visual states :
//  - No proposal + open booking → "Aucune proposition d'heure" (grey, idle)
//  - PENDING from client → "Marie a proposé 10h00" + [Accepter] [Proposer alt]
//  - PENDING from admin  → "En attente du client (proposé : 11h00)" + Annuler proposition
//  - ACCEPTED → "Heure confirmée : 10h00" (vert)
//  - REJECTED (latest, no newer PENDING) → "Refusée — proposez une nouvelle heure"
//
// Source : architecture proposal classe mondiale 2026-05-17.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, AlertCircle, Loader2, X } from 'lucide-react';

type Scope = 'ARRIVAL' | 'TAXI_GO' | 'TAXI_RETURN';

export interface ProposalSummary {
  id: string;
  scope: Scope;
  time: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED' | 'CANCELLED';
  proposedByRole: 'CLIENT' | 'ADMIN' | 'SUPERADMIN';
  proposalNote: string | null;
  responseNote: string | null;
}

interface Props {
  bookingId: string;
  scope: Scope;
  current: ProposalSummary | null; // latest PENDING for this scope, or null
  confirmed: ProposalSummary | null; // latest ACCEPTED for this scope, or null
  /** Whether the booking is in a state that allows time negotiation. */
  open: boolean;
  locale: string;
}

const SCOPE_LABEL: Record<Scope, { fr: string; en: string }> = {
  ARRIVAL:     { fr: 'arrivée à la pension', en: 'arrival at the pension' },
  TAXI_GO:     { fr: 'taxi aller', en: 'taxi outbound' },
  TAXI_RETURN: { fr: 'taxi retour', en: 'taxi return' },
};

export function TimeProposalBanner({ bookingId, scope, current, confirmed, open, locale }: Props) {
  const fr = locale === 'fr';
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showProposeForm, setShowProposeForm] = useState(false);
  const [proposeTime, setProposeTime] = useState('10:00');
  const [proposeNote, setProposeNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scopeLabel = fr ? SCOPE_LABEL[scope].fr : SCOPE_LABEL[scope].en;

  async function callApi(payload: Record<string, unknown>) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/time-proposals`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setError(j.error ?? `HTTP ${res.status}`);
        return false;
      }
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'NETWORK_ERROR');
      return false;
    } finally {
      setLoading(false);
    }
  }

  // ── Visual state resolution ──
  if (confirmed && !current) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-emerald-900">
            {fr ? `${scopeLabel} confirmée à ` : `${scopeLabel} confirmed at `}
            <span className="tabular-nums">{confirmed.time}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowProposeForm(true)}
          className="text-xs text-emerald-700 hover:underline"
        >
          {fr ? 'Modifier' : 'Change'}
        </button>
      </div>
    );
  }

  if (current?.status === 'PENDING' && current.proposedByRole === 'CLIENT') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <div className="flex items-start gap-3 mb-3">
          <Clock className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-900">
              {fr
                ? `Le client a proposé ${current.time} pour ${scopeLabel}`
                : `Client proposed ${current.time} for ${scopeLabel}`}
            </p>
            {current.proposalNote && (
              <p className="text-xs text-amber-700 italic mt-0.5">&laquo;&nbsp;{current.proposalNote}&nbsp;&raquo;</p>
            )}
          </div>
        </div>
        {!showProposeForm ? (
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => callApi({ action: 'accept', proposalId: current.id })}
              disabled={loading || !open}
              className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center gap-1"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              {fr ? `Accepter ${current.time}` : `Accept ${current.time}`}
            </button>
            <button
              type="button"
              onClick={() => setShowProposeForm(true)}
              disabled={loading || !open}
              className="px-3 py-1.5 rounded-md border border-amber-300 text-amber-800 text-xs font-medium hover:bg-amber-100"
            >
              {fr ? 'Proposer une autre heure' : 'Propose another time'}
            </button>
          </div>
        ) : (
          <ProposeForm
            fr={fr}
            time={proposeTime}
            setTime={setProposeTime}
            note={proposeNote}
            setNote={setProposeNote}
            onCancel={() => { setShowProposeForm(false); setError(null); }}
            onSubmit={async () => {
              const ok = await callApi({ action: 'propose', scope, time: proposeTime, note: proposeNote || null });
              if (ok) setShowProposeForm(false);
            }}
            loading={loading}
          />
        )}
        {error && <p className="text-xs text-red-700 mt-2">{error}</p>}
      </div>
    );
  }

  if (current?.status === 'PENDING' && (current.proposedByRole === 'ADMIN' || current.proposedByRole === 'SUPERADMIN')) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
        <div className="flex items-start gap-3">
          <Clock className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900">
              {fr
                ? `En attente du client — vous avez proposé ${current.time} pour ${scopeLabel}`
                : `Waiting for client — you proposed ${current.time} for ${scopeLabel}`}
            </p>
            {current.proposalNote && (
              <p className="text-xs text-blue-700 italic mt-0.5">&laquo;&nbsp;{current.proposalNote}&nbsp;&raquo;</p>
            )}
          </div>
        </div>
        {error && <p className="text-xs text-red-700 mt-2">{error}</p>}
      </div>
    );
  }

  // No PENDING + no ACCEPTED → idle (or REJECTED with no follow-up yet)
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      {!showProposeForm ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-gray-400" />
            <p className="text-sm text-gray-600">
              {fr ? `Aucune heure proposée pour ${scopeLabel}` : `No time proposed for ${scopeLabel}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowProposeForm(true)}
            disabled={!open}
            className="px-3 py-1.5 rounded-md bg-[#C4974A] text-white text-xs font-medium hover:bg-[#9A7235] disabled:opacity-40"
          >
            {fr ? 'Proposer une heure' : 'Propose a time'}
          </button>
        </div>
      ) : (
        <ProposeForm
          fr={fr}
          time={proposeTime}
          setTime={setProposeTime}
          note={proposeNote}
          setNote={setProposeNote}
          onCancel={() => { setShowProposeForm(false); setError(null); }}
          onSubmit={async () => {
            const ok = await callApi({ action: 'propose', scope, time: proposeTime, note: proposeNote || null });
            if (ok) setShowProposeForm(false);
          }}
          loading={loading}
        />
      )}
      {error && <p className="text-xs text-red-700 mt-2">{error}</p>}
    </div>
  );
}

function ProposeForm({
  fr, time, setTime, note, setNote, onCancel, onSubmit, loading,
}: {
  fr: boolean;
  time: string;
  setTime: (s: string) => void;
  note: string;
  setNote: (s: string) => void;
  onCancel: () => void;
  onSubmit: () => Promise<void>;
  loading: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-[10px] font-medium text-gray-500 uppercase mb-1">
            {fr ? 'Heure' : 'Time'}
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full px-2 py-1.5 rounded-md border border-[#E2C048]/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
          />
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-3 py-1.5 rounded-md text-xs text-gray-500 hover:bg-gray-100"
        >
          <X className="h-3 w-3 inline mr-1" />
          {fr ? 'Annuler' : 'Cancel'}
        </button>
        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={loading || !time}
          className="px-3 py-1.5 rounded-md bg-[#C4974A] text-white text-xs font-semibold hover:bg-[#9A7235] disabled:opacity-40 inline-flex items-center gap-1"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {fr ? 'Envoyer la proposition' : 'Send proposal'}
        </button>
      </div>
      <div>
        <label className="block text-[10px] font-medium text-gray-500 uppercase mb-1">
          {fr ? 'Note (optionnel)' : 'Note (optional)'}
        </label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder={fr ? 'Ex : équipe restreinte ce matin' : 'E.g. small team this morning'}
          className="w-full px-2 py-1.5 rounded-md border border-[#E2C048]/40 text-xs focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
        />
      </div>
    </div>
  );
}
