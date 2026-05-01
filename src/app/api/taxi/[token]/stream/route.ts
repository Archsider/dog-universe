// Server-Sent Events stream for the public taxi tracking page.
// Replaces the 3 s polling pattern with a long-lived HTTP connection that
// pushes new positions as soon as the driver's heartbeat updates them in
// Redis.
//
// Lifecycle of one connection (≤ 55 s, Vercel function limit):
//   1. Validate trackingToken → 404 if no trip, 410 if trip is in a
//      terminal status (COMPLETED / CANCELLED / NOT-active).
//   2. Send the current Redis position as the first 'location' event.
//   3. Every 2 s : poll Redis. If the timestamp moved, push 'location'.
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

// Vercel function timeout — needs to be < 60 s. We give ourselves a 5 s
// buffer to flush the closing event before the platform kills the runtime.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SOFT_TIMEOUT_MS   = 54_000;
const POLL_INTERVAL_MS  = 2_000;
const STATUS_CHECK_MS   = 10_000;
const KEEPALIVE_MS      = 15_000;

const TERMINAL_TRIP_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'ARRIVED_AT_PENSION', 'ARRIVED_AT_DESTINATION']);

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Read latest position with Redis-first / Postgres-fallback strategy.
// Without this fallback, an unconfigured or stale Redis silently breaks the
// stream — Postgres always has the latest TaxiLocation row from the
// driver's POST, so we can always recover.
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

      // 1. Initial snapshot — try Redis first, fall back to Postgres so the
      //    map shows immediately even if Redis is unconfigured/empty.
      send(sseEvent('connected', { ts: Date.now() }));
      const initial = await readLatest(bookingId, tripId);
      if (initial) {
        send(sseEvent('location', initial));
        lastTimestamp = initial.timestamp;
      }

      // 3. Poll for new positions — Redis hot path, Postgres fallback
      const pollPos = async () => {
        if (closed) return;
        const snap = await readLatest(bookingId, tripId);
        if (snap && snap.timestamp > lastTimestamp) {
          lastTimestamp = snap.timestamp;
          send(sseEvent('location', snap satisfies TaxiLocationSnapshot));
        }
      };

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

      const pollTimer = setInterval(() => { void pollPos(); }, POLL_INTERVAL_MS);
      const statusTimer = setInterval(() => { void checkStatus(); }, STATUS_CHECK_MS);
      const keepaliveTimer = setInterval(() => send(`: keepalive\n\n`), KEEPALIVE_MS);
      const softTimeout = setTimeout(() => {
        send(sseEvent('reconnect', { reason: 'soft-timeout' }));
        cleanup();
      }, SOFT_TIMEOUT_MS);

      function cleanup() {
        clearInterval(pollTimer);
        clearInterval(statusTimer);
        clearInterval(keepaliveTimer);
        clearTimeout(softTimeout);
        close();
      }

      // Detect client disconnect — Next.js uses an AbortSignal on the request
      _request.signal.addEventListener('abort', cleanup);
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
