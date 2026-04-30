import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { sendSMS } from '@/lib/sms';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.doguniverse.ma';
const MAX_LOCATIONS_PER_TRIP = 50;

type Body =
  | { action: 'start' }
  | { action: 'stop' }
  | {
      action: 'location';
      latitude: number;
      longitude: number;
      heading?: number | null;
      speed?: number | null;
      accuracy?: number | null;
    };

function isValidLat(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90;
}
function isValidLng(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180;
}
function isValidNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const trip = await prisma.taxiTrip.findUnique({
    where: { id: id },
    select: { id: true, trackingActive: true, trackingToken: true },
  });
  if (!trip) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  // ── start ──────────────────────────────────────────────────────────────
  if (body.action === 'start') {
    const trackingToken = trip.trackingToken ?? crypto.randomUUID();
    await prisma.taxiTrip.update({
      where: { id: id },
      data: { trackingActive: true, trackingToken },
    });

    // Récupère les infos client pour envoyer le SMS de suivi (1 query, action rare)
    const tripWithClient = await prisma.taxiTrip.findUnique({
      where: { id: id },
      select: {
        booking: {
          select: {
            client: { select: { name: true, phone: true, language: true } },
          },
        },
      },
    });
    const client = tripWithClient?.booking?.client;
    const clientLocale = client?.language === 'en' ? 'en' : 'fr';
    const trackingUrl = `${APP_URL}/${clientLocale}/track/${trackingToken}`;

    // SMS automatique au client (additif, échec n'empêche pas l'admin de démarrer le tracking)
    if (client?.phone) {
      const firstName = (client.name ?? '').split(' ')[0] || (client.name ?? '');
      const msg = clientLocale === 'en'
        ? `Hello ${firstName}! 🚗 Dog Universe is on the way. Track your pet live: ${trackingUrl} — Dog Universe`
        : `Bonjour ${firstName} ! 🚗 Dog Universe est en route. Suivez votre animal en direct : ${trackingUrl} — Dog Universe`;
      sendSMS(client.phone, msg).catch(() => { /* SMS additif */ });
    }

    return NextResponse.json({
      ok: true,
      trackingToken,
      trackingUrl,
    });
  }

  // ── stop ───────────────────────────────────────────────────────────────
  if (body.action === 'stop') {
    await prisma.taxiTrip.update({
      where: { id: id },
      data: { trackingActive: false },
    });
    return NextResponse.json({ ok: true });
  }

  // ── location ───────────────────────────────────────────────────────────
  if (body.action === 'location') {
    if (!trip.trackingActive) {
      return NextResponse.json({ error: 'TRACKING_NOT_ACTIVE' }, { status: 400 });
    }
    const { latitude, longitude, heading, speed, accuracy } = body;
    if (!isValidLat(latitude) || !isValidLng(longitude)) {
      return NextResponse.json({ error: 'INVALID_COORDINATES' }, { status: 400 });
    }

    await prisma.taxiLocation.create({
      data: {
        taxiTripId: id,
        latitude,
        longitude,
        heading: isValidNumber(heading) ? heading : null,
        speed: isValidNumber(speed) ? speed : null,
        accuracy: isValidNumber(accuracy) ? accuracy : null,
      },
    });

    // Cleanup : ne garder que les MAX_LOCATIONS_PER_TRIP plus récentes (batch 500 max pour éviter DoS)
    const stale = await prisma.taxiLocation.findMany({
      where: { taxiTripId: id },
      orderBy: { createdAt: 'desc' },
      skip: MAX_LOCATIONS_PER_TRIP,
      take: 500,
      select: { id: true },
    });
    if (stale.length > 0) {
      await prisma.taxiLocation.deleteMany({
        where: { id: { in: stale.map(r => r.id) } },
      });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'INVALID_ACTION' }, { status: 400 });
}
