'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Square, Copy, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

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

// Type minimal Wake Lock (compat tous environnements TS / browsers anciens)
type WakeLockSentinelLike = {
  release: () => Promise<void>;
  released: boolean;
};
type WakeLockNavigator = {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
};

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
  // Refs : watchPosition pour GPS continu, Wake Lock pour garder l'écran allumé
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  // Démarre / arrête le watch GPS + le wake lock quand trackingActive change
  useEffect(() => {
    const releaseWakeLock = async () => {
      try {
        if (wakeLockRef.current && !wakeLockRef.current.released) {
          await wakeLockRef.current.release();
        }
      } catch { /* silent */ }
      wakeLockRef.current = null;
    };

    if (!trackingActive) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      releaseWakeLock();
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast({
        title: isFr ? 'Géolocalisation non disponible' : 'Geolocation unavailable',
        variant: 'destructive',
      });
      return;
    }

    const pushLocation = async (pos: GeolocationPosition) => {
      try {
        await fetch(`/api/admin/taxi-trips/${taxiTripId}/tracking`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'location',
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
            accuracy: pos.coords.accuracy,
          }),
        });
      } catch {
        /* erreur réseau silencieuse — watchPosition continuera d'émettre */
      }
    };

    // watchPosition émet automatiquement à chaque changement de position
    // (pas besoin de setInterval). maximumAge:0 + timeout 10s pour fiabilité mobile.
    watchIdRef.current = navigator.geolocation.watchPosition(
      pushLocation,
      (err) => {
        // Permission refusée ou GPS indisponible — log mais ne stoppe pas le watch
        console.error('[GPS]', err.code, err.message);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );

    // Wake Lock — empêche l'écran de s'éteindre pendant la course
    const requestWakeLock = async () => {
      try {
        const nav = navigator as unknown as WakeLockNavigator;
        if (nav.wakeLock?.request) {
          wakeLockRef.current = await nav.wakeLock.request('screen');
        }
      } catch { /* non supporté ou refusé — silencieux */ }
    };
    requestWakeLock();

    // Le Wake Lock est libéré automatiquement par le navigateur quand la page
    // est cachée. On le ré-acquiert dès le retour de la page au premier plan.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && trackingActive && !wakeLockRef.current) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
      releaseWakeLock();
    };
  }, [trackingActive, taxiTripId, isFr]);

  // Composant invisible si le statut n'est pas un état de course en cours
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
      toast({ title: isFr ? 'Suivi GPS démarré' : 'GPS tracking started', variant: 'success' });
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
      toast({ title: isFr ? 'Suivi GPS arrêté' : 'GPS tracking stopped', variant: 'success' });
      router.refresh();
    } catch {
      toast({ title: isFr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const trackUrl = trackingToken ? `${window.location.origin}/${locale}/track/${trackingToken}` : '';

  const handleCopy = async () => {
    if (!trackUrl) return;
    try {
      await navigator.clipboard.writeText(trackUrl);
      toast({ title: isFr ? 'Lien copié !' : 'Link copied!', variant: 'success' });
    } catch {
      toast({ title: isFr ? 'Échec de la copie' : 'Copy failed', variant: 'destructive' });
    }
  };

  return (
    <div className="mt-3 space-y-2">
      {!trackingActive ? (
        <button
          type="button"
          onClick={handleStart}
          disabled={busy}
          className="w-full py-2.5 flex items-center justify-center gap-2 bg-white border border-[#C4974A] text-[#C4974A] hover:bg-[#C4974A] hover:text-white rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
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
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
            <span>⏹ {isFr ? 'Arrêter le suivi' : 'Stop tracking'}</span>
          </button>

          {trackingToken && (
            <div className="rounded-lg border border-[rgba(196,151,74,0.3)] bg-[#FEFCF9] p-3 space-y-2">
              <p className="text-xs font-semibold text-[#8A7E75]">
                {isFr ? 'Lien client' : 'Client link'}
              </p>
              <p className="text-xs font-mono break-all text-[#2A2520] bg-white border border-[rgba(196,151,74,0.15)] rounded px-2 py-1.5">
                /{locale}/track/{trackingToken}
              </p>
              <button
                type="button"
                onClick={handleCopy}
                className="w-full py-1.5 flex items-center justify-center gap-1.5 bg-white border border-[#C4974A] text-[#C4974A] hover:bg-[#C4974A] hover:text-white rounded-md text-xs font-medium transition-all duration-200"
              >
                <Copy className="h-3 w-3" />
                {isFr ? 'Copier le lien' : 'Copy link'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
