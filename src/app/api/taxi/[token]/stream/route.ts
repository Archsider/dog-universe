// Server-Sent Events stream for the public taxi tracking page.
// Replaces the 3 s polling pattern with a long-lived HTTP connection that
// pushes new positions as soon as the driver's heartbeat updates them in
// Redis.
//
// Lifecycle of one connection (≤ 55 s, Vercel function limit):
//   1. Validate trackingToken → 404 if no trip, 410 if trip is in a
//      terminal status (COMPLETED / CANCELLED / NOT-active).
//   2. Send the current Redis position as the first 'location' event.
//   3. Pub/Sub (preferred): subscribe to taxi:position:{bookingId} via
//      IORedis — pushes location events in real-time on every heartbeat.
//      Fallback: poll Redis every 5 s if Pub/Sub unavailable or fails.
//   4. Every 10 s : DB check on TaxiTrip status — if terminal, emit
//      'completed' and close cleanly.
//   5. Every 15 s : send a `:keepalive` SSE comment to defeat any proxy
//      idle timeouts.
//   6. At ~54 s the server closes; EventSource on the client reconnects
//      transparently.
//
// EventSource has no header support, so the trackingToken stays in the
// URL path (already public — same as the existing tracking page).
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getLocation, type TaxiLocationSnapshot } from '@/lib/taxi-location';
import { createPubSubConnection, isBullMQConfigured } from '@/lib/redis-bullmq';

// Vercel function timeout — needs to be < 60 s. We give ourselves a 5 s
// buffer to flush the closing event before the platform kills the runtime.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SOFT_TIMEOUT_MS    = 54_000;
const FALLBACK_POLL_MS   = 5_000;
const STATUS_CHECK_MS    = 10_000;
const KEEPALIVE_MS       = 15_000;

const TERMINAL_TRIP_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'ARRIVED_AT_PENSION', 'ARRIVED_AT_DESTINATION']);

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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
  const pubSubChannel = `taxi:position:${bookingId}`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      let lastTimestamp = 0;

      const send = (chunk: string) => {
        if (closed) return;
        try { controller.enqueue(enc.encode(chunk)); } catch { closed = true; }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      };

      // 1. Announce connection + send initial snapshot
      send(sseEvent('connected', { ts: Date.now() }));
      const initial = await getLocation(bookingId);
      if (initial) {
        send(sseEvent('location', initial));
        lastTimestamp = initial.timestamp;
      }

      // Fallback poll (used when Pub/Sub unavailable)
      const pollPos = async () => {
        if (closed) return;
        const snap = await getLocation(bookingId);
        if (snap && snap.timestamp > lastTimestamp) {
          lastTimestamp = snap.timestamp;
          send(sseEvent('location', snap satisfies TaxiLocationSnapshot));
        }
      };

      // 4. DB status check
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

      // 3. Try Pub/Sub; fall back to polling
      let subscriber = isBullMQConfigured() ? createPubSubConnection() : null;
      let usingPubSub = false;

      if (subscriber) {
        try {
          await subscriber.connect();
          await subscriber.subscribe(pubSubChannel);
          usingPubSub = true;

          subscriber.on('message', (ch: string, message: string) => {
            if (ch !== pubSubChannel || closed) return;
            try {
              const snap = JSON.parse(message) as TaxiLocationSnapshot;
              if (snap.timestamp > lastTimestamp) {
                lastTimestamp = snap.timestamp;
                send(sseEvent('location', snap));
              }
            } catch { /* malformed */ }
          });

          subscriber.on('error', () => {
            if (!usingPubSub || closed) return;
            // Pub/Sub connection dropped mid-stream — switch to polling
            usingPubSub = false;
            if (!closed) {
              pollTimer = setInterval(() => { void pollPos(); }, FALLBACK_POLL_MS);
            }
          });
        } catch {
          // Can't connect — use polling
          try { subscriber.disconnect(); } catch { /* ignore */ }
          subscriber = null;
          usingPubSub = false;
        }
      }

      let pollTimer: ReturnType<typeof setInterval> | null = null;
      if (!usingPubSub) {
        pollTimer = setInterval(() => { void pollPos(); }, FALLBACK_POLL_MS);
      }

      const statusTimer   = setInterval(() => { void checkStatus(); }, STATUS_CHECK_MS);
      const keepaliveTimer = setInterval(() => send(`: keepalive\n\n`), KEEPALIVE_MS);
      const softTimeout   = setTimeout(() => {
        send(sseEvent('reconnect', { reason: 'soft-timeout' }));
        cleanup();
      }, SOFT_TIMEOUT_MS);

      function cleanup() {
        if (pollTimer) clearInterval(pollTimer);
        clearInterval(statusTimer);
        clearInterval(keepaliveTimer);
        clearTimeout(softTimeout);
        if (subscriber) {
          void subscriber.unsubscribe(pubSubChannel).catch(() => {});
          try { subscriber.disconnect(); } catch { /* ignore */ }
          subscriber = null;
        }
        close();
      }

      _request.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
