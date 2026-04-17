'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

// ── Flows ────────────────────────────────────────────────────────────────────

export type TripType = 'OUTBOUND' | 'RETURN' | 'STANDALONE';

const FLOWS: Record<TripType, string[]> = {
  OUTBOUND:   ['PLANNED', 'EN_ROUTE_TO_CLIENT', 'ON_SITE_CLIENT', 'ANIMAL_ON_BOARD', 'ARRIVED_AT_PENSION'],
  STANDALONE: ['PLANNED', 'EN_ROUTE_TO_CLIENT', 'ON_SITE_CLIENT', 'ANIMAL_ON_BOARD', 'ARRIVED_AT_PENSION'],
  RETURN:     ['PLANNED', 'ANIMAL_ON_BOARD', 'EN_ROUTE_TO_CLIENT', 'ARRIVED_AT_CLIENT'],
};

// Context-aware step labels per tripType
const STEP_LABELS: Record<TripType, Record<string, { fr: string; en: string }>> = {
  OUTBOUND: {
    PLANNED:             { fr: 'Planifié',          en: 'Planned' },
    EN_ROUTE_TO_CLIENT:  { fr: 'En route',          en: 'En route' },
    ON_SITE_CLIENT:      { fr: 'Sur place',          en: 'On site' },
    ANIMAL_ON_BOARD:     { fr: 'Animal à bord',      en: 'Pet on board' },
    ARRIVED_AT_PENSION:  { fr: 'À la pension',        en: 'At facility' },
  },
  STANDALONE: {
    PLANNED:             { fr: 'Planifié',          en: 'Planned' },
    EN_ROUTE_TO_CLIENT:  { fr: 'En route',          en: 'En route' },
    ON_SITE_CLIENT:      { fr: 'Sur place',          en: 'On site' },
    ANIMAL_ON_BOARD:     { fr: 'Animal à bord',      en: 'Pet on board' },
    ARRIVED_AT_PENSION:  { fr: 'À destination',      en: 'Arrived' },
  },
  RETURN: {
    PLANNED:             { fr: 'Planifié',          en: 'Planned' },
    ANIMAL_ON_BOARD:     { fr: 'Animal chargé',     en: 'Pet loaded' },
    EN_ROUTE_TO_CLIENT:  { fr: 'En route domicile', en: 'En route home' },
    ARRIVED_AT_CLIENT:   { fr: 'Rendu au client',    en: 'Returned' },
  },
};

const ACTION_LABELS: Record<TripType, Record<string, { fr: string; en: string }>> = {
  OUTBOUND: {
    PLANNED:            { fr: 'Mettre en route',         en: 'Start driving to client' },
    EN_ROUTE_TO_CLIENT: { fr: 'Arrivé chez le client',  en: 'Mark arrived at client' },
    ON_SITE_CLIENT:     { fr: 'Animal à bord',           en: 'Mark pet on board' },
    ANIMAL_ON_BOARD:    { fr: 'Arrivé à la pension',     en: 'Mark arrived at facility' },
  },
  STANDALONE: {
    PLANNED:            { fr: 'Mettre en route',         en: 'Start driving' },
    EN_ROUTE_TO_CLIENT: { fr: 'Arrivé sur place',        en: 'Mark on site' },
    ON_SITE_CLIENT:     { fr: 'Animal à bord',           en: 'Mark pet on board' },
    ANIMAL_ON_BOARD:    { fr: 'Arrivé à destination',   en: 'Mark arrived' },
  },
  RETURN: {
    PLANNED:            { fr: "Charger l'animal",        en: 'Load the pet' },
    ANIMAL_ON_BOARD:    { fr: 'En route vers domicile',  en: 'Start driving home' },
    EN_ROUTE_TO_CLIENT: { fr: 'Animal rendu',            en: 'Mark pet returned' },
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaxiHistoryEntry = {
  id: string;
  status: string;
  timestamp: string; // ISO string
  updatedBy: string;
};

export type TaxiTripData = {
  id: string;
  tripType: string;
  status: string;
  date?: string | null;
  time?: string | null;
  address?: string | null;
  history: TaxiHistoryEntry[];
};

interface Props {
  trip: TaxiTripData;
  readOnly?: boolean;
  locale: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TaxiTimeline({ trip, readOnly = false, locale }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isFr = locale !== 'en';

  const tripType = (trip.tripType as TripType) in FLOWS ? (trip.tripType as TripType) : 'STANDALONE';
  const flow = FLOWS[tripType];
  const currentIdx = flow.indexOf(trip.status);
  const nextStatus = currentIdx >= 0 && currentIdx < flow.length - 1 ? flow[currentIdx + 1] : null;

  const stepLabels = STEP_LABELS[tripType];
  const actionLabels = ACTION_LABELS[tripType];
  const nextActionLabel = nextStatus ? actionLabels[trip.status] : null;

  // Map each status to its most-recent timestamp from history
  const statusTimestamps: Record<string, Date> = {};
  for (const h of trip.history) {
    const d = new Date(h.timestamp);
    if (!statusTimestamps[h.status] || d > statusTimestamps[h.status]) {
      statusTimestamps[h.status] = d;
    }
  }

  async function handleAdvance() {
    if (!nextStatus) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/taxi-trips/${trip.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      router.refresh();
    } catch {
      toast({ title: isFr ? 'Erreur lors de la mise à jour' : 'Update failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function fmtTime(d: Date) {
    return d.toLocaleTimeString(isFr ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  }

  const sortedHistory = [...trip.history].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  return (
    <div className="space-y-4">
      {/* Schedule info */}
      {(trip.date || trip.time || trip.address) && (
        <div className="text-xs text-gray-500 space-y-0.5">
          {trip.date && <span className="font-medium text-charcoal">{trip.date}{trip.time ? ` — ${trip.time}` : ''}</span>}
          {trip.address && <p className="text-gray-400 italic">{trip.address}</p>}
        </div>
      )}

      {/* Horizontal timeline */}
      <div className="flex items-start overflow-x-auto pb-1">
        {flow.map((step, idx) => {
          const isDone    = currentIdx > idx;
          const isActive  = currentIdx === idx;
          const ts        = statusTimestamps[step];
          const label     = stepLabels[step];

          return (
            <div key={step} className="flex items-start flex-1 min-w-0">
              <div className="flex flex-col items-center flex-1 min-w-0">
                {/* Dot */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 z-10 transition-all ${
                  isDone   ? 'bg-green-500 text-white' :
                  isActive ? 'bg-charcoal text-white ring-4 ring-charcoal/10 animate-pulse' :
                             'bg-gray-100 text-gray-300 border border-gray-200'
                }`}>
                  {isDone
                    ? <Check className="h-3.5 w-3.5" />
                    : <span className="text-[10px] font-bold">{idx + 1}</span>}
                </div>

                {/* Label */}
                <p className={`text-[10px] font-medium mt-1.5 text-center leading-tight px-0.5 ${
                  isDone   ? 'text-green-700' :
                  isActive ? 'text-charcoal font-semibold' :
                             'text-gray-300'
                }`}>
                  {isFr ? label?.fr : label?.en}
                </p>

                {/* Timestamp */}
                {ts && (isDone || isActive) && (
                  <p className="text-[9px] text-gray-400 mt-0.5 flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {fmtTime(ts)}
                  </p>
                )}
              </div>

              {/* Connector */}
              {idx < flow.length - 1 && (
                <div className={`h-0.5 flex-1 mt-3.5 mx-0.5 transition-all min-w-[8px] ${
                  isDone ? 'bg-green-400' : 'bg-gray-200'
                }`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Advance button */}
      {!readOnly && nextActionLabel && (
        <Button
          onClick={handleAdvance}
          disabled={loading}
          size="sm"
          className="w-full bg-charcoal hover:bg-charcoal/90 text-white"
        >
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
            : <ArrowRight className="h-4 w-4 mr-2" />}
          {isFr ? nextActionLabel.fr : nextActionLabel.en}
        </Button>
      )}

      {/* History */}
      {sortedHistory.length > 1 && (
        <div className="space-y-1 border-t border-gray-100 pt-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
            {isFr ? 'Historique' : 'History'}
          </p>
          {sortedHistory.map(h => (
            <div key={h.id} className="flex items-center gap-2 text-xs text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
              <span className="font-medium text-charcoal">
                {isFr ? stepLabels[h.status]?.fr ?? h.status : stepLabels[h.status]?.en ?? h.status}
              </span>
              <span className="ml-auto text-gray-400 tabular-nums">
                {new Date(h.timestamp).toLocaleTimeString(
                  isFr ? 'fr-FR' : 'en-US',
                  { hour: '2-digit', minute: '2-digit' },
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
