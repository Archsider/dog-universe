'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import { sseHealthFor, shouldRestartSse, SSE_LOST_MS } from '@/lib/taxi-gps';

// Fallback poll interval (used only if the SSE stream cannot be established
// — old browsers, blocked proxies, repeated server errors).
const FALLBACK_POLL_MS = 10_000;
// Threshold before we give up on SSE and switch to fallback polling.
const SSE_MAX_RECONNECT_ATTEMPTS = 3;
// Watchdog cadence : surveille la fraîcheur du dernier event SSE / la queue.
const WATCHDOG_INTERVAL_MS = 15_000;
// Tentative de re-bascule polling → SSE.
const POLLING_TO_SSE_PROBE_MS = 60_000;

// MapView encapsulates all Leaflet imports (CSS + JS) — lazy loaded only when
// a GPS position is available, keeping Leaflet out of the initial page bundle.
const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 gap-4">
      <div className="inline-block w-10 h-10 border-[3px] border-[#C4974A] border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

interface TrackResponse {
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

type LeafletDivIcon = unknown; // L.DivIcon importé dynamiquement à la volée

type ConnectionStatus = 'live' | 'reconnecting' | 'polling' | 'offline';

export default function TrackPage() {
  const params = useParams<{ locale: string; token: string }>();
  const locale = params?.locale === 'en' ? 'en' : 'fr';
  const isFr = locale === 'fr';
  const token = params?.token ?? '';

  const [data, setData] = useState<TrackResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'inactive' | 'notfound' | 'error'>('loading');
  const [carIcon, setCarIcon] = useState<LeafletDivIcon | null>(null);
  // Trail of past positions (for the gold polyline). Capped at 200 points.
  const [trail, setTrail] = useState<[number, number][]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('live');
  // Polling : setTimeout récursif (plus fiable que setInterval pour les requêtes lentes)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  // Refs impératifs Leaflet — passés à MapView pour les mises à jour de position
  // (setLatLng / flyTo) sans re-render du composant parent.
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  // Refs watchdog
  const lastSseEventAtRef = useRef<number>(0);
  const lastErrorAtRef = useRef<number>(0);
  const consecutiveErrorsRef = useRef(0);
  const sseModeRef = useRef<'sse' | 'polling' | 'idle'>('idle');
  const lastPollProbeAtRef = useRef<number>(0);
  const watchdogIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Référence aux fonctions de start (déclarées dans l'effet) pour les
  // handlers DOM qui doivent les appeler depuis l'extérieur (visibilitychange
  // / online / pageshow).
  const startSseRef = useRef<(() => void) | null>(null);
  const startPollingRef = useRef<(() => void) | null>(null);
  const forceReconnectRef = useRef<(() => void) | null>(null);

  // Charge l'icône custom (divIcon = pas d'image externe — CSP-safe).
  useEffect(() => {
    let cancelled = false;
    import('leaflet').then((L) => {
      if (cancelled) return;
      const icon = L.divIcon({
        html: `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
  <div data-rotor style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;transition:transform 0.3s ease-out;">
    <svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="14" r="11" fill="#C4974A" stroke="white" stroke-width="3" />
      <path d="M14 6 L18 14 L14 12 L10 14 Z" fill="white" />
    </svg>
  </div>
</div>`,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      setCarIcon(icon);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!token) return;
    let aborted = false;

    // Charge le trail historique (max 200 derniers points) avant le branchement
    // SSE — la polyline est ainsi visible immédiatement à l'ouverture du lien.
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/taxi-tracking/${token}/history`, { cache: 'no-store' });
        if (!res.ok || aborted) return;
        const json = (await res.json()) as { positions?: { lat: number; lng: number }[] };
        if (aborted || !json.positions) return;
        setTrail(json.positions.map(p => [p.lat, p.lng] as [number, number]));
      } catch { /* swallow */ }
    };
    void fetchHistory();

    const fetchOnce = async () => {
      try {
        const res = await fetch(`/api/taxi-tracking/${token}`, { cache: 'no-store' });
        if (aborted) return false;
        if (res.status === 404) { setStatus('notfound'); return false; }
        if (!res.ok) { setStatus('error'); return false; }
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

    // Polling fallback : exécution récursive setTimeout. Une fois lancé,
    // tourne tant que `aborted` est false ET sseModeRef.current === 'polling'.
    const startFallbackPolling = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      sseModeRef.current = 'polling';
      setConnectionStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'polling');

      const tick = async () => {
        if (aborted || sseModeRef.current !== 'polling') return;
        try {
          const res = await fetch(`/api/taxi-tracking/${token}`, { cache: 'no-store' });
          if (aborted) return;
          if (res.status === 404) { setStatus('notfound'); return; }
          if (res.ok) {
            const json = (await res.json()) as TrackResponse;
            if (!aborted) {
              setData((prev) => ({ ...prev, ...json }));
              setStatus(json.active ? 'ok' : 'inactive');
              lastSseEventAtRef.current = Date.now(); // freshness côté UI
            }
          }
        } catch { /* swallow — try again next tick */ }
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
      // Close any previous connection avant d'en ouvrir une nouvelle.
      if (eventSourceRef.current) {
        try { eventSourceRef.current.close(); } catch { /* silent */ }
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
        // Reset errors counter dès qu'on reçoit un event valide.
        consecutiveErrorsRef.current = 0;
      };

      es.addEventListener('connected', () => {
        markEvent();
        setConnectionStatus('live');
      });
      // Server soft-timeouts (~54s) emit 'reconnect' before closing the
      // stream. EventSource then auto-reconnects transparently.
      es.addEventListener('reconnect', () => { markEvent(); });

      es.addEventListener('location', (ev) => {
        if (aborted) return;
        markEvent();
        try {
          const payload = JSON.parse((ev as MessageEvent).data) as {
            lat: number; lng: number; timestamp: number;
            heading?: number | null; speed?: number | null;
            distanceKm?: number;
          };
          setData((prev) => ({
            ...prev,
            active: true,
            distanceKm: typeof payload.distanceKm === 'number' ? payload.distanceKm : prev?.distanceKm,
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
        } catch { /* malformed event — ignore */ }
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
        // EventSource will auto-reconnect; only escalate to polling fallback
        // when the connection has failed repeatedly.
        if (consecutiveErrorsRef.current >= SSE_MAX_RECONNECT_ATTEMPTS) {
          es.close();
          eventSourceRef.current = null;
          if (!aborted) startFallbackPolling();
        }
      };
    };
    startSseRef.current = startSse;

    // Force la reconnexion : close de l'EventSource courant + reset compteur
    // + relance startSse(). Si en mode polling, tente immédiatement un fetch
    // puis remonte vers SSE.
    const forceReconnect = () => {
      if (aborted) return;
      consecutiveErrorsRef.current = 0;
      if (eventSourceRef.current) {
        try { eventSourceRef.current.close(); } catch { /* silent */ }
        eventSourceRef.current = null;
      }
      // Stoppe le polling pour éviter doublon.
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
    // Surveille la fraîcheur du flux SSE / déclenche probe SSE depuis polling.
    watchdogIntervalRef.current = setInterval(() => {
      if (aborted) return;
      const now = Date.now();
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setConnectionStatus('offline');
        return;
      }
      if (sseModeRef.current === 'sse') {
        // Stream silencieusement mort ? L'EventSource onerror ne fire pas
        // toujours sur certains proxies / mobile networks.
        if (shouldRestartSse(lastSseEventAtRef.current, now)) {
          console.warn('[SSE watchdog] silence prolongé, force reconnect');
          forceReconnect();
          return;
        }
        const health = sseHealthFor(lastSseEventAtRef.current, now);
        setConnectionStatus(health === 'live' ? 'live' : 'reconnecting');
      } else if (sseModeRef.current === 'polling') {
        // Probe SSE ponctuelle pour tenter de revenir au push temps réel.
        if (now - lastPollProbeAtRef.current > POLLING_TO_SSE_PROBE_MS) {
          lastPollProbeAtRef.current = now;
          // Reset du compteur d'erreurs et nouvelle tentative de SSE.
          // Si le SSE échoue de nouveau, onerror redéclenchera startFallbackPolling.
          forceReconnect();
        }
      }
    }, WATCHDOG_INTERVAL_MS);

    // ── Handlers DOM ─────────────────────────────────────────────────────
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (aborted) return;
      // Si le dernier event est ancien → reconnect agressif.
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
      // bfcache restore : tout l'état JS est gelé puis restauré → l'EventSource
      // est mort sans fire d'erreur. Forcer reconnect.
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

  // ── Vues d'erreur / état ────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FEFCF9] text-[#8A7E75]">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-[#C4974A] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">{isFr ? 'Chargement…' : 'Loading…'}</p>
        </div>
      </div>
    );
  }

  if (status === 'notfound') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FEFCF9] px-6">
        <div className="text-center max-w-sm">
          <h1 className="font-serif text-2xl text-[#2A2520] mb-2">Dog Universe</h1>
          <p className="text-[#8A7E75]">
            {isFr ? 'Lien invalide ou expiré.' : 'Invalid or expired link.'}
          </p>
        </div>
      </div>
    );
  }

  if (status === 'inactive') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FEFCF9] px-6">
        <div className="text-center max-w-sm">
          <h1 className="font-serif text-2xl text-[#2A2520] mb-2">Dog Universe</h1>
          <p className="text-[#8A7E75] text-sm leading-relaxed">
            {isFr
              ? "Le suivi GPS n'est pas actif pour cette course."
              : 'GPS tracking is not active for this trip.'}
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FEFCF9] px-6">
        <div className="text-center max-w-sm">
          <p className="text-[#8A7E75] text-sm">
            {isFr ? 'Erreur réseau — nouvelle tentative dans quelques secondes…' : 'Network error — retrying in a few seconds…'}
          </p>
        </div>
      </div>
    );
  }

  const last = data?.lastLocation;
  const center: [number, number] = last ? [last.lat, last.lng] : [31.6295, -7.9811]; // Marrakech fallback
  const updatedAt = last ? new Date(last.createdAt).toLocaleTimeString(isFr ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

  // Badge de statut connexion (discret, en haut)
  const connectionBadge = (() => {
    switch (connectionStatus) {
      case 'live':
        return { dot: 'bg-green-500 animate-pulse', label: isFr ? 'En direct' : 'Live', emoji: '🟢' };
      case 'reconnecting':
        return { dot: 'bg-yellow-500 animate-pulse', label: isFr ? 'Reconnexion…' : 'Reconnecting…', emoji: '🟡' };
      case 'polling':
        return { dot: 'bg-blue-500', label: isFr ? 'Mise à jour 10s' : 'Updating every 10s', emoji: '🔵' };
      case 'offline':
        return { dot: 'bg-red-500', label: isFr ? 'Hors-ligne' : 'Offline', emoji: '🔴' };
    }
  })();

  return (
    <div className="min-h-screen flex flex-col bg-[#FEFCF9]">
      {/* Header */}
      <header className="px-4 py-3 sm:px-6 sm:py-4 bg-white border-b border-[rgba(196,151,74,0.2)] shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-base sm:text-lg font-bold text-[#2A2520] leading-tight">
              Dog Universe
            </h1>
            <p className="text-[10px] sm:text-xs text-[#C4974A] uppercase tracking-wider font-semibold">
              {isFr ? 'Suivi en direct' : 'Live tracking'}
            </p>
          </div>
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-[#8A7E75]"
              title={connectionBadge.label}
            >
              <span className={`inline-block w-2 h-2 rounded-full ${connectionBadge.dot}`} />
              {connectionBadge.label}
            </span>
            {(data?.firstName ?? data?.clientName) && (
              <div className="text-right min-w-0">
                <p className="text-xs sm:text-sm font-medium text-[#2A2520] truncate">
                  {data.firstName ?? data.clientName}
                </p>
                {(data.petSummary ?? data.petNames) && (
                  <p className="text-[10px] sm:text-xs text-[#8A7E75] truncate">
                    {data.petSummary ?? `🐾 ${data.petNames}`}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Carte */}
      <div className="flex-1 relative">
        {last ? (
          <MapView
            center={center}
            mapRef={mapRef}
            markerRef={markerRef}
            carIcon={carIcon}
            heading={last?.heading ?? null}
            trailPositions={trail}
            recenterLabel={isFr ? 'Recentrer' : 'Recenter'}
          />
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 gap-4">
            <div className="inline-block w-10 h-10 border-[3px] border-[#C4974A] border-t-transparent rounded-full animate-spin" />
            <p className="text-[#7A6E65] text-sm">
              {isFr
                ? 'En attente de la position GPS…'
                : 'Waiting for GPS position…'}
            </p>
            <p className="text-[#8A7E75] text-xs">
              {isFr
                ? 'Le chauffeur active le suivi sur son téléphone.'
                : 'Driver is enabling tracking on their phone.'}
            </p>
          </div>
        )}
      </div>

      {/* Footer info */}
      {last && (
        <footer className="px-4 py-3 sm:px-6 sm:py-3 bg-white border-t border-[rgba(196,151,74,0.2)]">
          <div className="max-w-3xl mx-auto flex items-center justify-between text-xs text-[#8A7E75]">
            <span className="flex items-center gap-1.5">
              <span className={`inline-block w-2 h-2 rounded-full ${connectionBadge.dot}`} />
              {isFr ? 'Mise à jour' : 'Updated'} : {updatedAt}
            </span>
            <span className="flex items-center gap-3">
              {typeof data?.distanceKm === 'number' && data.distanceKm > 0 && (
                <span className="font-medium text-[#C4974A]">
                  {data.distanceKm >= 10
                    ? `${data.distanceKm.toFixed(1)} km`
                    : `${data.distanceKm.toFixed(2)} km`}
                </span>
              )}
              {typeof last.speed === 'number' && last.speed >= 0 && (
                <span>{Math.round(last.speed * 3.6)} km/h</span>
              )}
            </span>
          </div>
        </footer>
      )}
    </div>
  );
}
