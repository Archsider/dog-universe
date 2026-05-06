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
  addEventListener: (event: 'release', handler: () => void) => void;
  removeEventListener: (event: 'release', handler: () => void) => void;
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
  const [queueSize, setQueueSize] = useState(0);
  const prevQueueSizeRef = useRef(0);
  // Refs : watchPosition pour GPS continu, Wake Lock pour garder l'écran allumé
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  // Enregistre le SW chauffeur (offline GPS buffer) au mount.
  // Distinct du sw.js PWA général : scope limité à /admin/reservations/.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw-driver.js', { scope: '/admin/reservations/' })
      .catch((err) => console.warn('[sw-driver register]', err));
  }, []);

  // Polling toutes les 5 s : récupère la taille de la queue offline + écoute les messages push du SW.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const requestSize = () => {
      const reg = navigator.serviceWorker.controller;
      if (!reg) return;
      const channel = new MessageChannel();
      channel.port1.onmessage = (e) => {
        if (e.data?.type === 'QUEUE_SIZE') {
          setQueueSize(e.data.size || 0);
        }
      };
      reg.postMessage({ type: 'GET_QUEUE_SIZE' }, [channel.port2]);
    };

    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'QUEUE_UPDATED') {
        setQueueSize(e.data.size || 0);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    requestSize();
    const interval = setInterval(requestSize, 5000);
    return () => {
      clearInterval(interval);
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, []);

  // Toast quand la queue revient à 0 après avoir été > 0 (synchronisation terminée)
  useEffect(() => {
    if (prevQueueSizeRef.current > 0 && queueSize === 0) {
      toast({
        title: isFr ? 'Positions synchronisées' : 'Positions synced',
        description: isFr ? 'Toutes les positions ont été synchronisées.' : 'All positions have been synced.',
        variant: 'success',
      });
    }
    prevQueueSizeRef.current = queueSize;
  }, [queueSize, isFr]);

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

    const pushLocation = async (coords: GeolocationCoordinates) => {
      try {
        await fetch(`/api/admin/taxi-trips/${taxiTripId}/tracking`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'location',
            latitude: coords.latitude,
            longitude: coords.longitude,
            heading: coords.heading,
            speed: coords.speed,
            accuracy: coords.accuracy,
          }),
        });
      } catch {
        /* erreur réseau silencieuse — watchPosition continuera d'émettre */
      }
    };

    // 1) Envoi immédiat via getCurrentPosition (ne pas attendre le 1er tick watchPosition)
    navigator.geolocation.getCurrentPosition(
      (pos) => pushLocation(pos.coords),
      (err) => console.error('[GPS init]', err.code, err.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );

    // 2) Watch continu — émet à chaque changement de position significatif
    //    distanceFilter:5 — non standard W3C, ignoré silencieusement par les browsers
    //    (filtrage applicatif côté serveur si besoin)
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => pushLocation(pos.coords),
      (err) => console.error('[GPS]', err.code, err.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000, distanceFilter: 5 } as PositionOptions,
    );

    // Wake Lock — empêche l'écran de s'éteindre pendant la course
    // Ré-acquisition automatique sur 'release' event (browser ou OS l'a relâché)
    const acquireWakeLock = async () => {
      try {
        const nav = navigator as unknown as WakeLockNavigator;
        if (!nav.wakeLock?.request) return;
        wakeLockRef.current = await nav.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', acquireWakeLock);
      } catch (e) { console.warn('Wake Lock non supporté:', e); }
    };
    acquireWakeLock();

    // Sécurité supplémentaire : ré-acquérir aussi sur retour à la visibilité
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && trackingActive && !wakeLockRef.current) {
        acquireWakeLock();
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
      {queueSize > 0 && (
        <div className="px-3 py-2 rounded-md bg-yellow-50 border border-yellow-300 text-yellow-900 text-xs font-medium flex items-center gap-2">
          <span className="animate-pulse">🔄</span>
          <span>
            {isFr
              ? `${queueSize} position${queueSize > 1 ? 's' : ''} en attente de synchronisation`
              : `${queueSize} position${queueSize > 1 ? 's' : ''} pending sync`}
          </span>
        </div>
      )}
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
