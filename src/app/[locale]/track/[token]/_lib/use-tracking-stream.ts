'use client';

// Hook encapsulating the entire tracking-stream lifecycle for the public
// track page:
//
//   1. Initial fetch of the trip metadata + history (200 last positions)
//   2. EventSource (SSE) for live push updates
//   3. Watchdog every 15 s — restarts SSE on prolonged silence, probes
//      back to SSE every 60 s when we're stuck on polling
//   4. Polling fallback (every 10 s) when SSE fails ≥3 times
//   5. DOM handlers — visibilitychange / online / offline / pageshow
//      (bfcache restore — EventSource is dead but doesn't fire onerror)
//
// All cleanup is centralised so unmounting the component leaves no
// orphaned timers / EventSource / DOM listeners.

import { useEffect, useRef, useState } from 'react';
import { sseHealthFor, shouldRestartSse, SSE_LOST_MS } from '@/lib/taxi-gps';
import { logger } from '@/lib/logger';

const FALLBACK_POLL_MS = 10_000;
const SSE_MAX_RECONNECT_ATTEMPTS = 3;
const WATCHDOG_INTERVAL_MS = 15_000;
const POLLING_TO_SSE_PROBE_MS = 60_000;

export interface TrackResponse {
  active?: boolean;
  distanceKm?: number;
  lastLocation?: {
    lat: number;
    lng: number;
    heading: number | null;
    speed: number | null;
    createdAt: string;
  } | null;
  // PII-reduced (2026-05-11): first name + species emoji counts only.
  // Legacy fields kept temporarily for backward compatibility during deploy.
  firstName?: string;
  petSummary?: string;
  clientName?: string;
  petNames?: string;
  error?: string;
}

export type ConnectionStatus = 'live' | 'reconnecting' | 'polling' | 'offline';
export type TrackStatus = 'loading' | 'ok' | 'inactive' | 'notfound' | 'error';

export interface UseTrackingStreamResult {
  data: TrackResponse | null;
  status: TrackStatus;
  trail: [number, number][];
  connectionStatus: ConnectionStatus;
}

export function useTrackingStream(token: string): UseTrackingStreamResult {
  const [data, setData] = useState<TrackResponse | null>(null);
  const [status, setStatus] = useState<TrackStatus>('loading');
  const [trail, setTrail] = useState<[number, number][]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('live');

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastSseEventAtRef = useRef<number>(0);
  const lastErrorAtRef = useRef<number>(0);
  const consecutiveErrorsRef = useRef(0);
  const sseModeRef = useRef<'sse' | 'polling' | 'idle'>('idle');
  const lastPollProbeAtRef = useRef<number>(0);
  const watchdogIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Refs to startSse / startPolling / forceReconnect so DOM handlers can
  // call them from outside the closure that defined them.
  const startSseRef = useRef<(() => void) | null>(null);
  const startPollingRef = useRef<(() => void) | null>(null);
  const forceReconnectRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!token) return;
    let aborted = false;

    // Load history (last 200 positions) BEFORE wiring SSE — the polyline
    // is then visible immediately on page open.
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/taxi-tracking/${token}/history`, { cache: 'no-store' });
        if (!res.ok || aborted) return;
        const json = (await res.json()) as { positions?: { lat: number; lng: number }[] };
        if (aborted || !json.positions) return;
        setTrail(json.positions.map((p) => [p.lat, p.lng] as [number, number]));
      } catch {
        /* swallow */
      }
    };
    void fetchHistory();

    const fetchOnce = async () => {
      try {
        const res = await fetch(`/api/taxi-tracking/${token}`, { cache: 'no-store' });
        if (aborted) return false;
        if (res.status === 404) {
          setStatus('notfound');
          return false;
        }
        if (!res.ok) {
          setStatus('error');
          return false;
        }
        const json = (await res.json()) as TrackResponse;
        if (aborted) return false;
        setData(json);
        setStatus(json.active ? 'ok' : 'inactive');
        return json.active === true;
      } catch {
        if (!aborted) setStatus('error');
        return false;
      }
    };

    // Polling fallback: recursive setTimeout. Runs while `aborted` is false
    // AND the mode ref is 'polling' (so SSE re-bascule stops it cleanly).
    const startFallbackPolling = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      sseModeRef.current = 'polling';
      setConnectionStatus(
        typeof navigator !== 'undefined' && navigator.onLine === false
          ? 'offline'
          : 'polling',
      );

      const tick = async () => {
        if (aborted || sseModeRef.current !== 'polling') return;
        try {
          const res = await fetch(`/api/taxi-tracking/${token}`, { cache: 'no-store' });
          if (aborted) return;
          if (res.status === 404) {
            setStatus('notfound');
            return;
          }
          if (res.ok) {
            const json = (await res.json()) as TrackResponse;
            if (!aborted) {
              setData((prev) => ({ ...prev, ...json }));
              setStatus(json.active ? 'ok' : 'inactive');
              lastSseEventAtRef.current = Date.now(); // keep UI freshness
            }
          }
        } catch {
          /* swallow — try again next tick */
        }
        if (!aborted && sseModeRef.current === 'polling') {
          timeoutRef.current = setTimeout(tick, FALLBACK_POLL_MS);
        }
      };
      void tick();
    };
    startPollingRef.current = startFallbackPolling;

    const startSse = () => {
      if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
        startFallbackPolling();
        return;
      }
      if (eventSourceRef.current) {
        try {
          eventSourceRef.current.close();
        } catch {
          /* silent */
        }
        eventSourceRef.current = null;
      }
      sseModeRef.current = 'sse';
      lastSseEventAtRef.current = Date.now();
      consecutiveErrorsRef.current = 0;
      setConnectionStatus('live');

      const es = new EventSource(`/api/taxi/${token}/stream`);
      eventSourceRef.current = es;

      const markEvent = () => {
        lastSseEventAtRef.current = Date.now();
        consecutiveErrorsRef.current = 0;
      };

      es.addEventListener('connected', () => {
        markEvent();
        setConnectionStatus('live');
      });
      // Server soft-timeouts (~54s) emit 'reconnect' before closing the stream.
      // EventSource then auto-reconnects transparently.
      es.addEventListener('reconnect', () => {
        markEvent();
      });

      es.addEventListener('location', (ev) => {
        if (aborted) return;
        markEvent();
        try {
          const payload = JSON.parse((ev as MessageEvent).data) as {
            lat: number;
            lng: number;
            timestamp: number;
            heading?: number | null;
            speed?: number | null;
            distanceKm?: number;
          };
          setData((prev) => ({
            ...prev,
            active: true,
            distanceKm:
              typeof payload.distanceKm === 'number' ? payload.distanceKm : prev?.distanceKm,
            lastLocation: {
              lat: payload.lat,
              lng: payload.lng,
              heading: payload.heading ?? null,
              speed: payload.speed ?? null,
              createdAt: new Date(payload.timestamp).toISOString(),
            },
          }));
          setTrail((prev) => {
            const next: [number, number][] = [...prev, [payload.lat, payload.lng]];
            return next.length > 200 ? next.slice(next.length - 200) : next;
          });
          setStatus('ok');
          setConnectionStatus('live');
        } catch {
          /* malformed event — ignore */
        }
      });

      es.addEventListener('completed', () => {
        if (aborted) return;
        setData((prev) => ({ ...prev, active: false }));
        setStatus('inactive');
        sseModeRef.current = 'idle';
        es.close();
      });

      es.onerror = () => {
        consecutiveErrorsRef.current += 1;
        lastErrorAtRef.current = Date.now();
        setConnectionStatus('reconnecting');
        // EventSource auto-reconnects; only escalate to polling fallback
        // when the connection has failed repeatedly.
        if (consecutiveErrorsRef.current >= SSE_MAX_RECONNECT_ATTEMPTS) {
          es.close();
          eventSourceRef.current = null;
          if (!aborted) startFallbackPolling();
        }
      };
    };
    startSseRef.current = startSse;

    // Force reconnect: close current EventSource + reset counter + restart SSE.
    // If polling mode, we drop the polling tick and try SSE first.
    const forceReconnect = () => {
      if (aborted) return;
      consecutiveErrorsRef.current = 0;
      if (eventSourceRef.current) {
        try {
          eventSourceRef.current.close();
        } catch {
          /* silent */
        }
        eventSourceRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      startSse();
    };
    forceReconnectRef.current = forceReconnect;

    void (async () => {
      const isActive = await fetchOnce();
      if (aborted) return;
      if (isActive) startSse();
    })();

    // ── Watchdog (15 s) ──────────────────────────────────────────────────
    watchdogIntervalRef.current = setInterval(() => {
      if (aborted) return;
      const now = Date.now();
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setConnectionStatus('offline');
        return;
      }
      if (sseModeRef.current === 'sse') {
        // Stream silently dead? EventSource onerror doesn't always fire on
        // certain proxies / mobile networks.
        if (shouldRestartSse(lastSseEventAtRef.current, now)) {
          logger.warn('sse-watchdog', 'prolonged silence, force reconnect');
          forceReconnect();
          return;
        }
        const health = sseHealthFor(lastSseEventAtRef.current, now);
        setConnectionStatus(health === 'live' ? 'live' : 'reconnecting');
      } else if (sseModeRef.current === 'polling') {
        // Probe SSE periodically to attempt going back to push real-time.
        if (now - lastPollProbeAtRef.current > POLLING_TO_SSE_PROBE_MS) {
          lastPollProbeAtRef.current = now;
          // Reset error counter and retry SSE. If SSE fails again, onerror
          // will trigger startFallbackPolling automatically.
          forceReconnect();
        }
      }
    }, WATCHDOG_INTERVAL_MS);

    // ── DOM handlers ─────────────────────────────────────────────────────
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (aborted) return;
      // If last event is old → aggressive reconnect.
      const now = Date.now();
      if (now - lastSseEventAtRef.current > SSE_LOST_MS / 2) {
        forceReconnectRef.current?.();
      }
    };
    const handleOnline = () => {
      if (aborted) return;
      forceReconnectRef.current?.();
    };
    const handleOffline = () => {
      setConnectionStatus('offline');
    };
    const handlePageShow = (ev: PageTransitionEvent) => {
      // bfcache restore: all JS state is frozen then restored → the
      // EventSource is dead without firing an error. Force reconnect.
      if (ev.persisted && !aborted) {
        forceReconnectRef.current?.();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      aborted = true;
      sseModeRef.current = 'idle';
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (watchdogIntervalRef.current) clearInterval(watchdogIntervalRef.current);
      watchdogIntervalRef.current = null;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [token]);

  return { data, status, trail, connectionStatus };
}
