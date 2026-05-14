'use client';

// GPS tracking hook — encapsulates the entire active-tracking lifecycle:
//
//   1. watchPosition + getCurrentPosition (initial fix)
//   2. Wake Lock (keeps screen on during the trip)
//   3. Watchdog every 15 s — restarts watch if no fix for 45 s
//   4. Forced ping every 30 s — keepalive for static drivers (iOS lock
//      screen tends to silence watchPosition when stationary)
//   5. Visibility / online / offline DOM handlers — refresh on focus,
//      flush queue on reconnect, toast on offline
//   6. In-memory pending queue — drops items > 10 min old, caps at 100
//
// All cleanup is centralised in the effect's teardown so toggling
// `trackingActive` off leaves no orphaned timers / watch / wake lock.
//
// State surfaced to the UI:
//   - gpsHealth: 'live' | 'stale' | 'lost' | 'idle'
//   - pendingSize: number of positions waiting in the local FIFO queue

import { useEffect, useRef, useState } from 'react';
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

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  released: boolean;
  addEventListener: (event: 'release', handler: () => void) => void;
  removeEventListener: (event: 'release', handler: () => void) => void;
};
type WakeLockNavigator = {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
};

type QueueItem = {
  ts: number;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
};

const WATCHDOG_INTERVAL_MS = 15_000;
const FORCED_PING_INTERVAL_MS = 30_000;
const FETCH_TIMEOUT_MS = 5_000;
const QUEUE_TOAST_THRESHOLD = 5;

// Minimum gap between two POSTs to the tracking endpoint. The server filter
// already rejects fixes < 1.5 s apart, but enforcing it client-side cuts
// network noise + Lambda invocations by ~3× during active driving. Below
// this gap the GPS movement is below useful resolution anyway (≤ 25 m at
// 30 km/h). watchPosition keeps firing for the watchdog freshness signal,
// only the network push is throttled.
const PUSH_MIN_INTERVAL_MS = 3_000;

export interface UseGpsTrackingResult {
  gpsHealth: 'live' | 'stale' | 'lost' | 'idle';
  pendingSize: number;
}

export function useGpsTracking(
  taxiTripId: string,
  trackingActive: boolean,
  isFr: boolean,
): UseGpsTrackingResult {
  const [pendingSize, setPendingSize] = useState(0);
  const [gpsHealth, setGpsHealth] = useState<'live' | 'stale' | 'lost' | 'idle'>('idle');
  const prevPendingWarnRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const lastFixAtRef = useRef<number>(0);
  const pendingQueueRef = useRef<QueueItem[]>([]);
  const watchdogIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const forcedPingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Throttle: last time we actually POSTed to the server (vs received a fix).
  const lastPushAtRef = useRef<number>(0);
  // Snapshot of trackingActive for DOM handlers (avoids stale closure).
  const trackingActiveRef = useRef(trackingActive);
  trackingActiveRef.current = trackingActive;

  useEffect(() => {
    const releaseWakeLock = async () => {
      try {
        if (wakeLockRef.current && !wakeLockRef.current.released) {
          await wakeLockRef.current.release();
        }
      } catch {
        /* silent */
      }
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
      void releaseWakeLock();
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast({
        title: isFr ? 'Géolocalisation non disponible' : 'Geolocation unavailable',
        variant: 'destructive',
      });
      return;
    }

    // POST a position with a 5s timeout. Returns true on 2xx.
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

    // Drain the local queue best-effort. Stops at first failure (likely
    // network down) — will be retried on the next watchdog tick.
    const flushQueue = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      // Drop too-old positions first (> 10 min): server doesn't want stale fixes.
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

    const pushLocation = async (coords: GeolocationCoordinates, force = false) => {
      const now = Date.now();
      // Always update the freshness ref — the watchdog and the gpsHealth
      // chip both key off "last fix received", not "last fix pushed".
      lastFixAtRef.current = now;
      // Throttle network pushes (the forced-ping path passes force=true so
      // the 30 s server keepalive is never starved by the throttle).
      if (!force && now - lastPushAtRef.current < PUSH_MIN_INTERVAL_MS) {
        return;
      }
      lastPushAtRef.current = now;
      const item: QueueItem = {
        ts: now,
        latitude: coords.latitude,
        longitude: coords.longitude,
        heading: coords.heading ?? null,
        speed: coords.speed ?? null,
        accuracy: coords.accuracy ?? null,
      };
      const ok = await sendOne(item);
      if (!ok) {
        // Direct send failed → enqueue for retry. FIFO cap (drop oldest).
        pendingQueueRef.current = clampQueue(
          [...pendingQueueRef.current, item],
          QUEUE_MAX,
        );
        setPendingSize(pendingQueueRef.current.length);
      } else if (pendingQueueRef.current.length > 0) {
        // Direct send recovered — try to drain the queue on the same tick.
        void flushQueue();
      }
    };

    // Clean restart of watchPosition (clearWatch + new watchPosition).
    const restartWatch = () => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return;
      if (watchIdRef.current !== null) {
        try {
          navigator.geolocation.clearWatch(watchIdRef.current);
        } catch {
          /* silent */
        }
        watchIdRef.current = null;
      }
      // Reset the ref to avoid a watchdog-induced restart cascade.
      lastFixAtRef.current = Date.now();
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => pushLocation(pos.coords),
        (err) =>
          logger.error('gps', 'watch error', { code: err.code, message: err.message }),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      );
    };

    // 1) Initial fix via getCurrentPosition (don't wait for the first
    //    watchPosition tick). force=true: bypass throttle for the very
    //    first fix so the map shows the marker immediately.
    lastFixAtRef.current = Date.now();
    navigator.geolocation.getCurrentPosition(
      (pos) => pushLocation(pos.coords, true),
      (err) =>
        logger.error('gps-init', 'getCurrentPosition failed', {
          code: err.code,
          message: err.message,
        }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );

    // 2) Continuous watch — fires on each significant position change.
    // `distanceFilter` does NOT exist in the Web Geolocation spec (that's
    // a React Native option); the browser silently ignores it. Throttling
    // happens inside pushLocation instead (PUSH_MIN_INTERVAL_MS).
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => pushLocation(pos.coords),
      (err) =>
        logger.error('gps', 'watch error', { code: err.code, message: err.message }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
    setGpsHealth('live');

    // Wake Lock — keep the screen on during the trip.
    const acquireWakeLock = async () => {
      try {
        const nav = navigator as unknown as WakeLockNavigator;
        if (!nav.wakeLock?.request) return;
        wakeLockRef.current = await nav.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', acquireWakeLock);
      } catch (e) {
        logger.warn('wake-lock', 'unsupported', { error: e });
      }
    };
    void acquireWakeLock();

    // ── Watchdog (15 s) ──────────────────────────────────────────────────
    // Tracks fix freshness. Restarts watch after 45 s of silence. Surfaces
    // gps health (live/stale/lost) and tries to drain the local queue.
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
      // One-shot toast when the local queue crosses the threshold.
      if (
        pendingQueueRef.current.length > QUEUE_TOAST_THRESHOLD &&
        !prevPendingWarnRef.current
      ) {
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
    // Server keepalive: when the driver is stationary, watchPosition can
    // silence (especially on iOS lock screen). An explicit getCurrentPosition
    // guarantees a push at least every 30 s.
    forcedPingIntervalRef.current = setInterval(() => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        // force=true: this is a keepalive — the throttle must not eat it
        // (the whole point is to push even when stationary).
        (pos) => pushLocation(pos.coords, true),
        (err) =>
          logger.warn('gps-forced', 'getCurrentPosition failed', {
            code: err.code,
            message: err.message,
          }),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
      );
    }, FORCED_PING_INTERVAL_MS);

    // ── DOM handlers: visibility / online / offline ──────────────────────
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (!trackingActiveRef.current) return;
      // Re-acquire wake lock if lost.
      if (!wakeLockRef.current) void acquireWakeLock();
      // Force an immediate fix + restart watch (avoids zombie watch in bg).
      restartWatch();
      navigator.geolocation.getCurrentPosition(
        // force=true: user just came back to the tab — give them an
        // immediate fix on the map without waiting on the throttle.
        (pos) => pushLocation(pos.coords, true),
        () => {
          /* silent */
        },
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
      void releaseWakeLock();
    };
  }, [trackingActive, taxiTripId, isFr]);

  return { gpsHealth, pendingSize };
}
