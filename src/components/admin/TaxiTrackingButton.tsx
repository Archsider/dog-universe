'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Square, Copy, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  gpsHealthFor,
  shouldRestartWatch,
  pruneQueue,
  clampQueue,
  QUEUE_MAX,
  QUEUE_MAX_AGE_MS,
} from '@/lib/taxi-gps';
import { logger } from '@/lib/logger';

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

// Élément de la queue offline : coords + timestamp pour pruning par âge.
type QueueItem = {
  ts: number;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
};

// Cadences watchdog / forced ping.
const WATCHDOG_INTERVAL_MS = 15_000;
const FORCED_PING_INTERVAL_MS = 30_000;
const FETCH_TIMEOUT_MS = 5_000;
// Seuil de toast "connexion instable" (queue locale, hors SW).
const QUEUE_TOAST_THRESHOLD = 5;

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
  const [pendingSize, setPendingSize] = useState(0);
  const [gpsHealth, setGpsHealth] = useState<'live' | 'stale' | 'lost' | 'idle'>('idle');
  const prevQueueSizeRef = useRef(0);
  const prevPendingWarnRef = useRef(false);
  // Refs : watchPosition pour GPS continu, Wake Lock pour garder l'écran allumé
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  // Refs watchdog / file d'attente locale
  const lastFixAtRef = useRef<number>(0);
  const pendingQueueRef = useRef<QueueItem[]>([]);
  const watchdogIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const forcedPingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Snapshot des dépendances stables pour les handlers DOM (évite stale closure)
  const trackingActiveRef = useRef(trackingActive);
  trackingActiveRef.current = trackingActive;

  // Enregistre le SW chauffeur (offline GPS buffer) au mount.
  // Distinct du sw.js PWA général : scope limité à /admin/reservations/.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw-driver.js', { scope: '/admin/reservations/' })
      .catch((err) => logger.warn('sw-driver', 'register failed', { error: err }));
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
      if (watchdogIntervalRef.current) clearInterval(watchdogIntervalRef.current);
      if (forcedPingIntervalRef.current) clearInterval(forcedPingIntervalRef.current);
      watchdogIntervalRef.current = null;
      forcedPingIntervalRef.current = null;
      pendingQueueRef.current = [];
      setPendingSize(0);
      setGpsHealth('idle');
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

    // POST une position avec timeout 5s. Renvoie true si OK, false sinon.
    const sendOne = async (item: QueueItem): Promise<boolean> => {
      try {
        const res = await fetch(`/api/admin/taxi-trips/${taxiTripId}/tracking`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'location',
            latitude: item.latitude,
            longitude: item.longitude,
            heading: item.heading,
            speed: item.speed,
            accuracy: item.accuracy,
          }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        return res.ok;
      } catch {
        return false;
      }
    };

    // Vide la queue locale en mode best-effort. Stoppe au premier échec
    // (probable réseau down) — sera réessayée au prochain tick watchdog.
    const flushQueue = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      // Drop d'abord les positions trop vieilles (>10 min) pour ne pas
      // envoyer des coordonnées obsolètes au serveur.
      pendingQueueRef.current = pruneQueue(
        pendingQueueRef.current,
        QUEUE_MAX_AGE_MS,
        Date.now(),
      );
      while (pendingQueueRef.current.length > 0) {
        const next = pendingQueueRef.current[0];
        if (!next) break;
        const ok = await sendOne(next);
        if (!ok) break;
        pendingQueueRef.current.shift();
      }
      setPendingSize(pendingQueueRef.current.length);
    };

    const pushLocation = async (coords: GeolocationCoordinates) => {
      lastFixAtRef.current = Date.now();
      const item: QueueItem = {
        ts: Date.now(),
        latitude: coords.latitude,
        longitude: coords.longitude,
        heading: coords.heading ?? null,
        speed: coords.speed ?? null,
        accuracy: coords.accuracy ?? null,
      };
      const ok = await sendOne(item);
      if (!ok) {
        // Échec direct → enqueue pour retry. FIFO cap 100 (drop oldest).
        pendingQueueRef.current = clampQueue(
          [...pendingQueueRef.current, item],
          QUEUE_MAX,
        );
        setPendingSize(pendingQueueRef.current.length);
      } else if (pendingQueueRef.current.length > 0) {
        // Dès qu'un envoi direct réussit, tenter de purger la queue.
        void flushQueue();
      }
    };

    // Restart propre du watchPosition (clearWatch + nouveau watchPosition).
    const restartWatch = () => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return;
      if (watchIdRef.current !== null) {
        try { navigator.geolocation.clearWatch(watchIdRef.current); } catch { /* silent */ }
        watchIdRef.current = null;
      }
      // Reset le repère pour éviter une cascade de restarts watchdog.
      lastFixAtRef.current = Date.now();
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => pushLocation(pos.coords),
        (err) => logger.error('gps', 'watch error', { code: err.code, message: err.message }),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000, distanceFilter: 5 } as PositionOptions,
      );
    };

    // 1) Envoi immédiat via getCurrentPosition (ne pas attendre le 1er tick watchPosition)
    lastFixAtRef.current = Date.now();
    navigator.geolocation.getCurrentPosition(
      (pos) => pushLocation(pos.coords),
      (err) => logger.error('gps-init', 'getCurrentPosition failed', { code: err.code, message: err.message }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );

    // 2) Watch continu — émet à chaque changement de position significatif
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => pushLocation(pos.coords),
      (err) => logger.error('gps', 'watch error', { code: err.code, message: err.message }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000, distanceFilter: 5 } as PositionOptions,
    );
    setGpsHealth('live');

    // Wake Lock — empêche l'écran de s'éteindre pendant la course
    const acquireWakeLock = async () => {
      try {
        const nav = navigator as unknown as WakeLockNavigator;
        if (!nav.wakeLock?.request) return;
        wakeLockRef.current = await nav.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', acquireWakeLock);
      } catch (e) { logger.warn('wake-lock', 'unsupported', { error: e }); }
    };
    acquireWakeLock();

    // ── Watchdog (15 s) ──────────────────────────────────────────────────
    // Surveille la fraîcheur du dernier fix. Restart le watch si silence > 45s.
    // Surface l'état GPS (live/stale/lost) et tente de purger la queue.
    watchdogIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const health = gpsHealthFor(lastFixAtRef.current, now);
      setGpsHealth(health);
      if (shouldRestartWatch(lastFixAtRef.current, now)) {
        logger.warn('gps-watchdog', 'prolonged silence, restarting watch');
        restartWatch();
      }
      if (
        pendingQueueRef.current.length > 0 &&
        typeof navigator !== 'undefined' &&
        navigator.onLine !== false
      ) {
        void flushQueue();
      }
      // Toast unique quand la queue locale franchit le seuil.
      if (pendingQueueRef.current.length > QUEUE_TOAST_THRESHOLD && !prevPendingWarnRef.current) {
        prevPendingWarnRef.current = true;
        toast({
          title: isFr ? 'Connexion instable' : 'Unstable connection',
          description: isFr
            ? `${pendingQueueRef.current.length} positions en attente.`
            : `${pendingQueueRef.current.length} positions queued.`,
          variant: 'default',
        });
      } else if (pendingQueueRef.current.length === 0) {
        prevPendingWarnRef.current = false;
      }
    }, WATCHDOG_INTERVAL_MS);

    // ── Forced ping (30 s) ───────────────────────────────────────────────
    // Keepalive serveur : si chauffeur immobile, watchPosition peut ne plus
    // tirer (surtout sur iOS lock screen). Un getCurrentPosition explicite
    // garantit qu'au pire on push toutes les 30 s.
    forcedPingIntervalRef.current = setInterval(() => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => pushLocation(pos.coords),
        (err) => logger.warn('gps-forced', 'getCurrentPosition failed', { code: err.code, message: err.message }),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
      );
    }, FORCED_PING_INTERVAL_MS);

    // ── Handlers DOM : visibilité / online / offline ─────────────────────
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (!trackingActiveRef.current) return;
      // Ré-acquérir wake lock si perdu.
      if (!wakeLockRef.current) acquireWakeLock();
      // Forcer un fix immédiat + restart watch (évite watch zombie en background).
      restartWatch();
      navigator.geolocation.getCurrentPosition(
        (pos) => pushLocation(pos.coords),
        () => { /* silent */ },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
      );
      void flushQueue();
    };
    const handleOnline = () => {
      void flushQueue();
      restartWatch();
    };
    const handleOffline = () => {
      toast({
        title: isFr ? 'Hors-ligne' : 'Offline',
        description: isFr
          ? 'Positions mises en queue, reprise dès la reconnexion.'
          : 'Positions queued, will resume when reconnected.',
        variant: 'default',
      });
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (watchdogIntervalRef.current) clearInterval(watchdogIntervalRef.current);
      if (forcedPingIntervalRef.current) clearInterval(forcedPingIntervalRef.current);
      watchdogIntervalRef.current = null;
      forcedPingIntervalRef.current = null;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
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

  // Badge visuel de santé GPS — affiché uniquement quand tracking actif.
  const healthBadge = (() => {
    if (!trackingActive) return null;
    if (gpsHealth === 'live') {
      return (
        <div className="px-3 py-2 rounded-md bg-green-50 border border-green-300 text-green-900 text-xs font-medium flex items-center gap-2">
          <span>🟢</span><span>{isFr ? 'GPS actif' : 'GPS live'}</span>
        </div>
      );
    }
    if (gpsHealth === 'stale') {
      return (
        <div className="px-3 py-2 rounded-md bg-yellow-50 border border-yellow-300 text-yellow-900 text-xs font-medium flex items-center gap-2">
          <span>🟡</span><span>{isFr ? 'GPS en attente…' : 'GPS waiting…'}</span>
        </div>
      );
    }
    if (gpsHealth === 'lost') {
      return (
        <div className="px-3 py-2 rounded-md bg-red-50 border border-red-300 text-red-900 text-xs font-medium flex items-center gap-2">
          <span>🔴</span><span>{isFr ? 'GPS perdu — reconnexion…' : 'GPS lost — reconnecting…'}</span>
        </div>
      );
    }
    return null;
  })();

  return (
    <div className="mt-3 space-y-2">
      {healthBadge}
      {pendingSize > 0 && (
        <div className="px-3 py-2 rounded-md bg-orange-50 border border-orange-300 text-orange-900 text-xs font-medium flex items-center gap-2">
          <span className="animate-pulse">📡</span>
          <span>
            {isFr
              ? `${pendingSize} position${pendingSize > 1 ? 's' : ''} en file (réseau)`
              : `${pendingSize} position${pendingSize > 1 ? 's' : ''} queued (network)`}
          </span>
        </div>
      )}
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
