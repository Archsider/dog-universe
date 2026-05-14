'use client';

// Slim orchestrator — see _taxi-tracking/ for the extracted hooks and
// section components.
//
// File went from 523 LOC to ~140 by extracting:
//   - _taxi-tracking/use-driver-sw.ts        (60L)  SW registration + queue size polling
//   - _taxi-tracking/use-gps-tracking.ts     (300L) the giant tracking effect
//                                                   (watchPosition + watchdog + forced ping
//                                                   + wake lock + queue + DOM handlers)
//   - _taxi-tracking/StatusBadges.tsx        (90L)  HealthBadge + QueueBadges
//   - _taxi-tracking/TrackingLinkCard.tsx    (60L)  link display + copy button
//
// What stays here: the start/stop button handlers (POST /tracking) and the
// final render shell. Everything else is in the hooks.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Square, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useDriverServiceWorker } from './_taxi-tracking/use-driver-sw';
import { useGpsTracking } from './_taxi-tracking/use-gps-tracking';
import { HealthBadge, QueueBadges } from './_taxi-tracking/StatusBadges';
import { TrackingLinkCard } from './_taxi-tracking/TrackingLinkCard';

interface Props {
  taxiTripId: string;
  tripType: string;
  status: string;
  trackingActive: boolean;
  trackingToken: string | null;
  locale?: string;
}

const TRACKABLE_STATUSES = new Set([
  'EN_ROUTE_TO_CLIENT',
  'ON_SITE_CLIENT',
  'ANIMAL_ON_BOARD',
]);

export default function TaxiTrackingButton({
  taxiTripId,
  status,
  trackingActive,
  trackingToken,
  locale = 'fr',
}: Props) {
  const router = useRouter();
  const isFr = locale !== 'en';
  const [busy, setBusy] = useState(false);

  const queueSize = useDriverServiceWorker();
  const { gpsHealth, pendingSize } = useGpsTracking(taxiTripId, trackingActive, isFr);

  // "Positions synced" toast — fires once when the SW queue transitions
  // from >0 to 0 (background sync completed).
  const prevQueueSizeRef = useRef(0);
  useEffect(() => {
    if (prevQueueSizeRef.current > 0 && queueSize === 0) {
      toast({
        title: isFr ? 'Positions synchronisées' : 'Positions synced',
        description: isFr
          ? 'Toutes les positions ont été synchronisées.'
          : 'All positions have been synced.',
        variant: 'success',
      });
    }
    prevQueueSizeRef.current = queueSize;
  }, [queueSize, isFr]);

  // Hidden if the trip isn't in an active travelling state.
  if (!TRACKABLE_STATUSES.has(status)) return null;

  const handleStart = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/taxi-trips/${taxiTripId}/tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({
        title: isFr ? 'Suivi GPS démarré' : 'GPS tracking started',
        variant: 'success',
      });
      router.refresh();
    } catch {
      toast({ title: isFr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/taxi-trips/${taxiTripId}/tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({
        title: isFr ? 'Suivi GPS arrêté' : 'GPS tracking stopped',
        variant: 'success',
      });
      router.refresh();
    } catch {
      toast({ title: isFr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <HealthBadge trackingActive={trackingActive} gpsHealth={gpsHealth} isFr={isFr} />
      <QueueBadges pendingSize={pendingSize} queueSize={queueSize} isFr={isFr} />

      {!trackingActive ? (
        <button
          type="button"
          onClick={handleStart}
          disabled={busy}
          className="w-full py-2.5 flex items-center justify-center gap-2 bg-white border border-[#C4974A] text-[#C4974A] hover:bg-[#C4974A] hover:text-white rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MapPin className="h-4 w-4" />
          )}
          <span>📍 {isFr ? 'Démarrer le suivi' : 'Start tracking'}</span>
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={handleStop}
            disabled={busy}
            className="w-full py-2.5 flex items-center justify-center gap-2 bg-white border border-red-500 text-red-600 hover:bg-red-500 hover:text-white rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            <span>⏹ {isFr ? 'Arrêter le suivi' : 'Stop tracking'}</span>
          </button>

          {trackingToken && (
            <TrackingLinkCard
              trackingToken={trackingToken}
              locale={locale}
              isFr={isFr}
            />
          )}
        </>
      )}
    </div>
  );
}
