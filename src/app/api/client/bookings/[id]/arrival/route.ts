// POST /api/client/bookings/[id]/arrival
//
// Client taps "Je suis arrivé" on the booking detail page → browser
// capture la geolocation → POST ici.  Le serveur valide qu'on est
// effectivement proche de la pension (Haversine sur les coords env)
// puis pingue l'admin (notif + SMS) + idempotence Redis 24h.
//
// "Effet ils m'attendent" : le bouton declare au client qu'on est en
// train de préparer l'accueil, AVANT même qu'il franchisse le portail.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { haversineDistance } from '@/lib/geo';
import { tryAcquireFlag } from '@/lib/cache';
import { createAdminNotifications } from '@/lib/notifications';
import { sendSmsNow } from '@/lib/notify-now';
import { logAction } from '@/lib/log';
import { logger } from '@/lib/logger';
import { todayCasaYmd } from '@/lib/daily-reports';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
}).strict();

// Distance threshold — anything beyond 1.5 km we treat as "not arrived yet"
// (GPS error margins in urban canyons can push you off by 500 m–1 km).
const NEAR_DISTANCE_METERS = 1500;
const FAR_DISTANCE_METERS  = 8000; // reject the call if obviously elsewhere

function getPensionCoords(): { lat: number; lng: number } | null {
  const lat = parseFloat(process.env.NEXT_PUBLIC_PENSION_LAT ?? '');
  const lng = parseFloat(process.env.NEXT_PUBLIC_PENSION_LNG ?? '');
  if (!isFinite(lat) || !isFinite(lng)) return null;
  return { lat, lng };
}

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const guard = await requireRole(['CLIENT']);
  if (guard.error) return guard.error;
  const { session } = guard;

  let payload;
  try {
    payload = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const pensionCoords = getPensionCoords();
  if (!pensionCoords) {
    // No env config — feature silently disabled.  Don't show this to the
    // client : the UI gates this button on its own checks too.
    logger.error('arrival', 'PENSION_COORDS_NOT_CONFIGURED', { bookingId: id });
    return NextResponse.json({ error: 'FEATURE_DISABLED' }, { status: 503 });
  }

  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id, clientId: session.user.id }),
    select: {
      id: true,
      status: true,
      startDate: true,
      client: {
        select: {
          id: true,
          name: true,
          firstName: true,
          phone: true,
        },
      },
      bookingPets: {
        select: { pet: { select: { name: true } } },
        take: 5,
      },
    },
  });

  if (!booking) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  // Only fires for CONFIRMED bookings starting today/tomorrow.  Anything
  // else and we can't be "arriving" meaningfully.
  if (booking.status !== 'CONFIRMED') {
    return NextResponse.json({ error: 'BOOKING_NOT_CONFIRMED' }, { status: 409 });
  }

  const today = todayCasaYmd();
  // Cheaper Casa-anchored check : startDate within next 36h
  const startsAt = booking.startDate.getTime();
  const now = Date.now();
  const horizon36h = 36 * 3600 * 1000;
  if (startsAt - now > horizon36h) {
    return NextResponse.json({ error: 'TOO_EARLY' }, { status: 409 });
  }
  if (now - startsAt > 12 * 3600 * 1000) {
    return NextResponse.json({ error: 'TOO_LATE' }, { status: 409 });
  }

  const distance = haversineDistance(
    payload.lat, payload.lng,
    pensionCoords.lat, pensionCoords.lng,
  );

  // Anti-spoof : if you're 50 km away, you're not "arriving".
  if (distance > FAR_DISTANCE_METERS) {
    return NextResponse.json({
      error: 'TOO_FAR',
      distanceMeters: Math.round(distance),
    }, { status: 400 });
  }

  // The client always gets a positive UI response if they're near — the
  // server-side check is just to gate the SMS / admin notif fan-out.
  const isNear = distance <= NEAR_DISTANCE_METERS;

  // Idempotency flag — only consume when we're ACTUALLY near.  Acquiring
  // it eagerly (before the isNear check) would let a far-away tap burn
  // the daily key, then silently drop the in-range tap that follows (the
  // P1 bug Codex flagged on PR #180).  Stay scoped to (booking, day).
  let acquired = false;
  if (isNear) {
    const flagKey = `arrival:fired:${booking.id}:${today}`;
    acquired = await tryAcquireFlag(flagKey, 86_400); // 24h
  }

  if (isNear && acquired) {
    const firstName = booking.client.firstName ?? booking.client.name?.split(' ')[0] ?? 'Un client';
    const petName = booking.bookingPets[0]?.pet.name ?? '';
    const messageFr = petName
      ? `${firstName} arrive — préparer accueil de ${petName}`
      : `${firstName} arrive — préparer l'accueil`;
    const messageEn = petName
      ? `${firstName} is arriving — get ${petName}'s welcome ready`
      : `${firstName} is arriving — get the welcome ready`;

    try {
      await createAdminNotifications({
        type: 'CLIENT_ARRIVAL_NEARBY',
        titleFr: '📍 Arrivée imminente',
        titleEn: '📍 Arrival imminent',
        messageFr,
        messageEn,
        metadata: {
          bookingId: booking.id,
          clientId: booking.client.id,
          distanceMeters: String(Math.round(distance)),
        },
      });
    } catch (err) {
      logger.error('arrival', 'NOTIFICATION_CREATE_FAILED', {
        bookingId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // SMS to the founder/operator — sendSmsNow uses sendAdminSMS when
    // `to: 'ADMIN'` is passed.
    sendSmsNow({
      to: 'ADMIN',
      message: `🐾 ${messageFr} (~${Math.round(distance)}m)`,
    });

    await logAction({
      userId: session.user.id,
      action: 'CLIENT_ARRIVAL_NEARBY',
      entityType: 'Booking',
      entityId: booking.id,
      details: {
        distanceMeters: Math.round(distance),
        lat: payload.lat,
        lng: payload.lng,
      },
    });
  }

  return NextResponse.json({
    isNear,
    distanceMeters: Math.round(distance),
    alreadyFired: !acquired,
  });
}
