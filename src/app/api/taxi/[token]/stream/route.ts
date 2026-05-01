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

// Vercel function timeout — Hobby caps at 60 s. We give ourselves a 6 s
// buffer to flush the closing event before the platform kills the runtime.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SOFT_TIMEOUT_MS    = 54_000;
const FALLBACK_POLL_MS   = 5_000;
const STATUS_CHECK_MS    = 10_000;
const KEEPALIVE_MS       = 20_000;

const TERMINAL_TRIP_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'ARRIVED_AT_PENSION', 'ARRIVED_AT_DESTINATION']);

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Read latest position with Redis-first / Postgres-fallback strategy.
// Used for the initial snapshot AND for the 5 s fallback polling loop when
// Pub/Sub is unavailable.
async function readLatest(bookingId: string, tripId: string): Promise<TaxiLocationSnapshot | null> {
  const cached = await getLocation(bookingId);
  if (cached) return cached;
  const row = await prisma.taxiLocation.findFirst({
    where: { taxiTripId: tripId },
    orderBy: { createdAt: 'desc' },
    select: { latitude: true, longitude: true, heading: true, speed: true, createdAt: true },
  }).catch(() => null);
  if (!row) return null;
  return {
    lat: row.latitude,
    lng: row.longitude,
    timestamp: row.createdAt.getTime(),
    heading: row.heading,
    speed: row.speed,
  };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const trip = await prisma.taxiTrip.findUnique({
    where: { trackingToken: token },
    select: {
      id: true,
      bookingId: true,
      status: true,
      trackingActive: true,
      booking: { select: { deletedAt: true } },
    },
  });

  if (!trip || trip.booking.deletedAt) {
    return new Response('Not found', { status: 404 });
  }

  if (!trip.trackingActive || TERMINAL_TRIP_STATUSES.has(trip.status)) {
    return new Response('Tracking not active', { status: 410 });
  }

  const bookingId = trip.bookingId;
  const tripId = trip.id;
  const channel = `taxi:loc:${bookingId}`;

  let subscriber: IORedis | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let statusTimer: ReturnType<typeof setInterval> | null = null;
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  let softTimeout: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      let lastTimestamp = 0;

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
        if (softTimeout) { clearTimeout(softTimeout); softTimeout = null; }
        if (subscriber) {
          const sub = subscriber;
          subscriber = null;
          // Best-effort teardown — never await/throw in cleanup
          sub.unsubscribe(channel).catch(() => undefined).finally(() => {
            sub.quit().catch(() => undefined);
          });
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
      }

      // 2. Try Pub/Sub first — dedicated IORedis subscriber (must NOT be the
      //    shared BullMQ connection: subscribe puts the client in subscriber
      //    mode and disallows other commands).
      let pubsubActive = false;
      if (isBullMQConfigured()) {
        try {
          const base = getBullMQConnection();
          subscriber = base.duplicate();
          // ioredis lazyConnect is true on the base; duplicate inherits it.
          // subscribe() implicitly connects.
          subscriber.on('error', (err: Error) => {
            console.error(JSON.stringify({ level: 'error', service: 'taxi-stream', message: 'subscriber error', bookingId, error: err.message, timestamp: new Date().toISOString() }));
          });
          subscriber.on('message', (_chan: string, msg: string) => {
            if (closed) return;
            try {
              const snap = JSON.parse(msg) as TaxiLocationSnapshot;
              if (typeof snap?.lat === 'number' && typeof snap?.lng === 'number') {
                if (typeof snap.timestamp === 'number' && snap.timestamp <= lastTimestamp) return;
                if (typeof snap.timestamp === 'number') lastTimestamp = snap.timestamp;
                send(sseEvent('location', snap));
              }
            } catch {
              // Malformed payload — ignore
            }
          });
          await subscriber.subscribe(channel);
          pubsubActive = true;
        } catch (err) {
          console.error(JSON.stringify({ level: 'error', service: 'taxi-stream', message: 'subscribe failed, using polling fallback', bookingId, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
          if (subscriber) {
            try { await subscriber.quit(); } catch { /* noop */ }
            subscriber = null;
          }
        }
      }

      // 3. Polling fallback (5 s) when Pub/Sub is unavailable.
      if (!pubsubActive) {
        const pollPos = async () => {
          if (closed) return;
          const snap = await readLatest(bookingId, tripId);
          if (snap && snap.timestamp > lastTimestamp) {
            lastTimestamp = snap.timestamp;
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
      if (softTimeout) { clearTimeout(softTimeout); softTimeout = null; }
      if (subscriber) {
        const sub = subscriber;
        subscriber = null;
        sub.unsubscribe(channel).catch(() => undefined).finally(() => {
          sub.quit().catch(() => undefined);
        });
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // hint for nginx-style proxies
    },
  });
}
