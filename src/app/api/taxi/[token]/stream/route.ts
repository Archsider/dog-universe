// Server-Sent Events stream for the public taxi tracking page.
// Replaces the legacy 2 s polling pattern with Redis Pub/Sub: the heartbeat
// endpoint SETs the latest position AND PUBLISHes to `taxi:loc:{bookingId}`,
// and this route subscribes via a dedicated IORedis connection to push events
// to the browser instantly. A 5 s polling loop is preserved as a fallback
// when IORedis is not configured or the subscription fails.
//
// Lifecycle of one connection (≤ 60 s, Vercel function limit):
//   1. Validate trackingToken → 404 if no trip, 410 if trip is in a terminal
//      status (COMPLETED / CANCELLED / NOT-active).
//   2. Send the current Redis position as the first 'location' event.
//   3. Subscribe to the per-booking channel via IORedis (TCP). Each PUBLISH
//      is forwarded as a 'location' SSE event.
//   4. If Pub/Sub is unavailable, fall back to a 5 s polling loop (Redis →
//      Postgres) — slower than the old 2 s loop but still functional.
//   5. Every 10 s : DB check on TaxiTrip status — if terminal, emit
//      'completed' and close cleanly.
//   6. Every 20 s : send a `:keepalive` SSE comment to defeat any proxy
//      idle timeouts.
//   7. At ~54 s the server closes; EventSource on the client reconnects
//      transparently.
//
// EventSource has no header support, so the trackingToken stays in the
// URL path (already public — same as the existing tracking page).
import { NextRequest } from 'next/server';
import type IORedis from 'ioredis';
import { prisma } from '@/lib/prisma';
import { getLocation, type TaxiLocationSnapshot } from '@/lib/taxi-location';
import { getBullMQConnection, isBullMQConfigured } from '@/lib/redis-bullmq';
import { getEta } from '@/lib/osrm';
import { tryAcquireFlag } from '@/lib/cache';
import { createTaxiArrivingSoonNotification } from '@/lib/notifications';
import { verifyTaxiToken } from '@/lib/taxi-token';
import { logger } from '@/lib/logger';

// Vercel function timeout — Hobby caps at 60 s. We give ourselves a 6 s
// buffer to flush the closing event before the platform kills the runtime.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SOFT_TIMEOUT_MS    = 54_000;
const FALLBACK_POLL_MS   = 5_000;
const STATUS_CHECK_MS    = 10_000;
// 30 s keepalive (was 20 s) — most proxies tolerate 60 s idle, so 30 s gives
// a comfortable margin while halving the keepalive event rate on long-lived
// connections.
const KEEPALIVE_MS       = 30_000;
const ETA_REFRESH_MS     = 30_000;
const ARRIVING_SOON_THRESHOLD_SEC = 300; // 5 min

const TERMINAL_TRIP_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'ARRIVED_AT_PENSION', 'ARRIVED_AT_DESTINATION']);

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ── IORedis subscriber pool ────────────────────────────────────────────────
// Each SSE connection used to call `getBullMQConnection().duplicate()` and
// subscribe to its own channel. With N concurrent viewers on the same trip
// we'd burn N Upstash TCP connections for the exact same Pub/Sub stream.
//
// The pool maintains one shared subscriber per channel (process-local). A
// listener Set fans out incoming messages to every active SSE connection.
// When the last listener leaves, the subscriber is unsubscribed + quit and
// the entry is dropped from the map.
type ChannelEntry = {
  subscriber: IORedis;
  refCount: number;
  listeners: Set<(msg: string) => void>;
  pending?: Promise<void>;
};
const channelPool = new Map<string, ChannelEntry>();

async function acquireSubscriber(
  channel: string,
  listener: (msg: string) => void,
): Promise<{ release: () => Promise<void> } | null> {
  if (!isBullMQConfigured()) return null;

  const existing = channelPool.get(channel);
  if (existing) {
    // If a previous concurrent acquire is still wiring up subscribe(), wait
    // for it so we don't add the listener before the channel is live.
    if (existing.pending) {
      try { await existing.pending; } catch { return null; }
    }
    existing.refCount += 1;
    existing.listeners.add(listener);
    return { release: () => releaseSubscriber(channel, listener) };
  }

  let subscriber: IORedis;
  try {
    subscriber = getBullMQConnection().duplicate();
  } catch (err) {
    logger.error('taxi-stream', 'duplicate failed', { channel, error: err instanceof Error ? err.message : String(err) });
    return null;
  }

  const listeners = new Set<(msg: string) => void>([listener]);
  const entry: ChannelEntry = { subscriber, refCount: 1, listeners };
  channelPool.set(channel, entry);

  subscriber.on('error', (err: Error) => {
    logger.error('taxi-stream', 'subscriber error', { channel, error: err.message });
  });
  subscriber.on('message', (_chan: string, msg: string) => {
    // Snapshot listeners — a release() mid-iteration mutates the set.
    const current = Array.from(entry.listeners);
    for (const fn of current) {
      try { fn(msg); } catch { /* listener swallows its own errors */ }
    }
  });

  const pending = subscriber.subscribe(channel).then(() => undefined);
  entry.pending = pending;
  try {
    await pending;
    entry.pending = undefined;
  } catch (err) {
    entry.pending = undefined;
    channelPool.delete(channel);
    try { await subscriber.quit(); } catch { /* noop */ }
    logger.error('taxi-stream', 'subscribe failed', { channel, error: err instanceof Error ? err.message : String(err) });
    return null;
  }

  return { release: () => releaseSubscriber(channel, listener) };
}

async function releaseSubscriber(
  channel: string,
  listener: (msg: string) => void,
): Promise<void> {
  const entry = channelPool.get(channel);
  if (!entry) return;
  // Idempotent: a listener leaving twice (defensive double-cleanup) is a noop.
  if (!entry.listeners.delete(listener)) return;
  entry.refCount -= 1;
  if (entry.refCount > 0) return;
  // Last listener gone — drop entry and tear down subscriber.
  channelPool.delete(channel);
  const sub = entry.subscriber;
  try { await sub.unsubscribe(channel); } catch { /* noop */ }
  try { await sub.quit(); } catch { /* noop */ }
}

// Read latest position with Redis-first / Postgres-fallback strategy.
// Used for the initial snapshot AND for the 5 s fallback polling loop when
// Pub/Sub is unavailable.
async function readLatest(bookingId: string, tripId: string): Promise<TaxiLocationSnapshot | null> {
  const cached = await getLocation(bookingId);
  if (cached) return cached;
  // Postgres fallback: join the TaxiTrip to also surface cumulative distance.
  // Without this, after a Redis cache miss the client would lose distanceKm.
  const [row, trip] = await Promise.all([
    prisma.taxiLocation.findFirst({
      where: { taxiTripId: tripId },
      orderBy: { createdAt: 'desc' },
      select: { latitude: true, longitude: true, heading: true, speed: true, createdAt: true },
    }).catch(() => null),
    prisma.taxiTrip.findUnique({
      where: { id: tripId },
      select: { distanceKm: true },
    }).catch(() => null),
  ]);
  if (!row) return null;
  return {
    lat: row.latitude,
    lng: row.longitude,
    timestamp: row.createdAt.getTime(),
    heading: row.heading,
    speed: row.speed,
    distanceKm: trip?.distanceKm ?? undefined,
  };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const verified = verifyTaxiToken(token);
  const trip = await prisma.taxiTrip.findUnique({
    where: verified ? { id: verified.tripId } : { trackingToken: token },
    select: {
      id: true,
      bookingId: true,
      status: true,
      trackingActive: true,
      trackingToken: true,
      trackingTokenExpiresAt: true,
      booking: {
        select: {
          deletedAt: true,
          clientId: true,
          taxiDetail: {
            select: {
              pickupLat: true,
              pickupLng: true,
              dropoffLat: true,
              dropoffLng: true,
            },
          },
        },
      },
    },
  });

  if (!trip || trip.booking.deletedAt || (verified && trip.trackingToken !== token)) {
    if (!verified) {
      logger.warn('taxi-token', 'unauthorized stream access', {
        event: '404',
        ip: _request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        tokenPrefix: token.slice(0, 8),
      });
    }
    return new Response('Not found', { status: 404 });
  }

  if (trip.trackingTokenExpiresAt && trip.trackingTokenExpiresAt.getTime() < Date.now()) {
    return new Response('Gone', { status: 410 });
  }

  if (!trip.trackingActive || TERMINAL_TRIP_STATUSES.has(trip.status)) {
    return new Response('Tracking not active', { status: 410 });
  }

  const bookingId = trip.bookingId;
  const tripId = trip.id;
  const channel = `taxi:loc:${bookingId}`;

  let subscriberHandle: { release: () => Promise<void> } | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let statusTimer: ReturnType<typeof setInterval> | null = null;
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  let etaTimer: ReturnType<typeof setInterval> | null = null;
  let softTimeout: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      let lastTimestamp = 0;
      let lastLat: number | null = null;
      let lastLng: number | null = null;

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      };

      function cleanup() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
        if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null; }
        if (etaTimer) { clearInterval(etaTimer); etaTimer = null; }
        if (softTimeout) { clearTimeout(softTimeout); softTimeout = null; }
        if (subscriberHandle) {
          const handle = subscriberHandle;
          subscriberHandle = null;
          // Pool-aware release — only tears down the IORedis subscriber when
          // refCount hits 0. Never await/throw here.
          void handle.release().catch(() => undefined);
        }
        close();
      }

      // 1. Initial snapshot — try Redis first, fall back to Postgres so the
      //    map shows immediately even if Redis is unconfigured/empty.
      send(sseEvent('connected', { ts: Date.now() }));
      const initial = await readLatest(bookingId, tripId);
      if (initial) {
        send(sseEvent('location', initial));
        lastTimestamp = initial.timestamp;
        lastLat = initial.lat;
        lastLng = initial.lng;
      }

      // 2. Pub/Sub via shared subscriber pool — one IORedis subscriber per
      //    channel across the whole process. Multiple SSE connections to the
      //    same trip share a single Upstash TCP connection.
      const onMessage = (msg: string) => {
        if (closed) return;
        try {
          const snap = JSON.parse(msg) as TaxiLocationSnapshot;
          if (typeof snap?.lat === 'number' && typeof snap?.lng === 'number') {
            if (typeof snap.timestamp === 'number' && snap.timestamp <= lastTimestamp) return;
            if (typeof snap.timestamp === 'number') lastTimestamp = snap.timestamp;
            lastLat = snap.lat;
            lastLng = snap.lng;
            send(sseEvent('location', snap));
          }
        } catch {
          // Malformed payload — ignore
        }
      };
      subscriberHandle = await acquireSubscriber(channel, onMessage);
      const pubsubActive = subscriberHandle !== null;

      // 3. Polling fallback (5 s) when Pub/Sub is unavailable.
      if (!pubsubActive) {
        const pollPos = async () => {
          if (closed) return;
          const snap = await readLatest(bookingId, tripId);
          if (snap && snap.timestamp > lastTimestamp) {
            lastTimestamp = snap.timestamp;
            lastLat = snap.lat;
            lastLng = snap.lng;
            send(sseEvent('location', snap));
          }
        };
        pollTimer = setInterval(() => { void pollPos(); }, FALLBACK_POLL_MS);
      }

      // 4. Watch DB for terminal status
      const checkStatus = async () => {
        if (closed) return;
        const fresh = await prisma.taxiTrip.findUnique({
          where: { id: tripId },
          select: { status: true, trackingActive: true },
        }).catch(() => null);
        if (!fresh) return;
        if (!fresh.trackingActive || TERMINAL_TRIP_STATUSES.has(fresh.status)) {
          send(sseEvent('completed', { status: fresh.status }));
          cleanup();
        }
      };

      statusTimer = setInterval(() => { void checkStatus(); }, STATUS_CHECK_MS);
      keepaliveTimer = setInterval(() => send(`: keepalive\n\n`), KEEPALIVE_MS);

      // ── ETA computation ────────────────────────────────────────────────
      // OSRM is rate-limited (and slow), so we only compute the ETA at
      // connect (after the initial 'location' event) and then every 30 s.
      // Target switches based on current trip status: pickup before the
      // pet boards, dropoff afterwards.
      const taxiDetail = trip.booking.taxiDetail;
      const clientId = trip.booking.clientId;
      let currentStatus: string = trip.status;

      const computeAndEmitEta = async () => {
        if (closed || lastLat == null || lastLng == null) return;
        // Refresh status — auto-transitions can change it between ticks.
        try {
          const fresh = await prisma.taxiTrip.findUnique({
            where: { id: tripId },
            select: { status: true },
          });
          if (fresh?.status) currentStatus = fresh.status;
        } catch { /* keep last known status */ }

        const targetLat = currentStatus === 'ANIMAL_ON_BOARD'
          ? taxiDetail?.dropoffLat
          : taxiDetail?.pickupLat;
        const targetLng = currentStatus === 'ANIMAL_ON_BOARD'
          ? taxiDetail?.dropoffLng
          : taxiDetail?.pickupLng;
        if (targetLat == null || targetLng == null) return;

        const eta = await getEta(lastLat, lastLng, targetLat, targetLng);
        if (!eta) return;
        send(sseEvent('eta', {
          durationSec: eta.durationSec,
          distanceM: eta.distanceM,
          geometryPolyline: eta.geometry,
        }));

        // Arriving-soon notification: client when ETA to pickup < 5 min and
        // driver is still EN_ROUTE_TO_CLIENT. Idempotent per booking via
        // 30 min Redis flag.
        if (
          currentStatus === 'EN_ROUTE_TO_CLIENT' &&
          eta.durationSec < ARRIVING_SOON_THRESHOLD_SEC
        ) {
          try {
            const acquired = await tryAcquireFlag(`taxi:eta_alert:${bookingId}`, 1800);
            if (acquired) {
              await createTaxiArrivingSoonNotification(clientId, bookingId, eta.durationSec, 'fr');
            }
          } catch (err) {
            logger.error('taxi-stream', 'arriving-soon notif failed', { bookingId, error: err instanceof Error ? err.message : String(err) });
          }
        }
      };

      // Fire once at connect (if we have a position) then every 30 s.
      if (lastLat != null && lastLng != null) {
        void computeAndEmitEta();
      }
      etaTimer = setInterval(() => { void computeAndEmitEta(); }, ETA_REFRESH_MS);

      softTimeout = setTimeout(() => {
        send(sseEvent('reconnect', { reason: 'soft-timeout' }));
        cleanup();
      }, SOFT_TIMEOUT_MS);

      // Detect client disconnect — Next.js uses an AbortSignal on the request
      _request.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      // ReadableStream consumer aborted — mirror cleanup defensively.
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
      if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null; }
      if (etaTimer) { clearInterval(etaTimer); etaTimer = null; }
      if (softTimeout) { clearTimeout(softTimeout); softTimeout = null; }
      if (subscriberHandle) {
        const handle = subscriberHandle;
        subscriberHandle = null;
        // Pool-aware release — refCount decrement, no direct teardown.
        void handle.release().catch(() => undefined);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // hint for nginx-style proxies
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
