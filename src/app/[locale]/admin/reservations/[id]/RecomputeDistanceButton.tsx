'use client';

// Admin-only button to retroactively recompute the cumulative distance of
// a TaxiTrip by replaying its stored TaxiLocation rows through the same
// filter the live ingestion uses. Useful for trips logged before the GPS
// filter was tightened — they show inflated distances (drift counted as
// movement). Idempotent: clicking twice gives the same number.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';

interface RecomputeDistanceButtonProps {
  taxiTripId: string;
  currentDistanceKm: number;
  locale: string;
}

interface RecomputeResponse {
  ok: boolean;
  before: number;
  after: number;
  pointsCount: number;
  pairsEvaluated?: number;
  pairsCounted?: number;
}

export default function RecomputeDistanceButton({
  taxiTripId,
  currentDistanceKm,
  locale,
}: RecomputeDistanceButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isFr = locale === 'fr';

  async function handleClick() {
    if (loading) return;
    const confirmMsg = isFr
      ? `Recalculer la distance à partir des positions GPS enregistrées ?\n\nDistance actuelle : ${currentDistanceKm.toFixed(2)} km`
      : `Recompute distance from stored GPS positions?\n\nCurrent distance: ${currentDistanceKm.toFixed(2)} km`;
    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/taxi-trips/${taxiTripId}/recompute-distance`, {
        method: 'POST',
      });
      if (!res.ok) {
        toast({
          title: isFr ? 'Erreur' : 'Error',
          description: isFr
            ? 'Impossible de recalculer la distance.'
            : 'Could not recompute distance.',
          variant: 'destructive',
        });
        return;
      }
      const data: RecomputeResponse = await res.json();
      const delta = data.after - data.before;
      const sign = delta >= 0 ? '+' : '';
      toast({
        title: isFr ? 'Distance recalculée' : 'Distance recomputed',
        description: isFr
          ? `${data.before.toFixed(2)} km → ${data.after.toFixed(2)} km (${sign}${delta.toFixed(2)} km) · ${data.pointsCount} points`
          : `${data.before.toFixed(2)} km → ${data.after.toFixed(2)} km (${sign}${delta.toFixed(2)} km) · ${data.pointsCount} points`,
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="text-xs px-3 py-1.5 rounded-lg border border-[rgba(196,151,74,0.3)] text-[#C4974A] hover:bg-[#FEFCF9] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {loading
        ? isFr ? 'Calcul…' : 'Computing…'
        : isFr ? '↻ Recalculer la distance' : '↻ Recompute distance'}
    </button>
  );
}
