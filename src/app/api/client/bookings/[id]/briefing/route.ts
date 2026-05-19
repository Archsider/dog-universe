// GET  /api/client/bookings/[id]/briefing  → returns the briefing data
// POST /api/client/bookings/[id]/briefing  → upsert the form data, marks submittedAt
//
// CLIENT-only auth ; booking ownership checked.  A briefing row is auto-
// created on first GET so the client can fill the form even if the cron
// hasn't fired yet (e.g. they navigated directly).

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import {
  briefingFormSchema,
  parseBriefingForm,
  serializeBriefingForm,
} from '@/lib/pre-stay-briefing';
import { createAdminNotifications } from '@/lib/notifications';
import { logger } from '@/lib/logger';
import { logAction } from '@/lib/log';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const guard = await requireRole(['CLIENT']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id, clientId: session.user.id }),
    select: {
      id: true,
      status: true,
      startDate: true,
      serviceType: true,
      bookingPets: {
        select: { pet: { select: { name: true, species: true } } },
        take: 5,
      },
      preStayBriefing: true,
    },
  });

  if (!booking) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  // Auto-create a blank row if missing — lets the client open the form
  // anytime even when the cron hasn't fired yet.
  let briefing = booking.preStayBriefing;
  if (!briefing) {
    try {
      briefing = await prisma.preStayBriefing.create({
        data: { bookingId: booking.id },
      });
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
        briefing = await prisma.preStayBriefing.findUnique({ where: { bookingId: booking.id } });
      } else {
        throw err;
      }
    }
  }

  return NextResponse.json({
    booking: {
      id: booking.id,
      status: booking.status,
      startDate: booking.startDate.toISOString(),
      serviceType: booking.serviceType,
      petName: booking.bookingPets[0]?.pet?.name ?? '',
    },
    briefing: briefing ? {
      formData: parseBriefingForm(briefing.formData),
      submittedAt: briefing.submittedAt?.toISOString() ?? null,
    } : null,
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const guard = await requireRole(['CLIENT']);
  if (guard.error) return guard.error;
  const { session } = guard;

  let payload;
  try {
    payload = briefingFormSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id, clientId: session.user.id }),
    select: {
      id: true,
      status: true,
      startDate: true,
      serviceType: true,
      bookingPets: {
        select: { pet: { select: { name: true } } },
        take: 5,
      },
    },
  });

  if (!booking) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  // Server-side eligibility gate — the UI gates with `canEdit` but a direct
  // API call could otherwise mutate historical / cancelled briefings and
  // trigger spurious admin notifications.  Mirror the conditions used by
  // /client/bookings/[id]/briefing page.tsx → `canEdit`.
  const ELIGIBLE_STATUSES = ['PENDING', 'CONFIRMED'] as const;
  if (booking.serviceType !== 'BOARDING') {
    return NextResponse.json({ error: 'NOT_BOARDING' }, { status: 400 });
  }
  if (!(ELIGIBLE_STATUSES as readonly string[]).includes(booking.status)) {
    return NextResponse.json({ error: 'BOOKING_NOT_EDITABLE' }, { status: 409 });
  }
  // Allow up to 24 h past the startDate as a grace window (late arrivals,
  // owner finishing the form while dropping off).
  if (booking.startDate.getTime() < Date.now() - 24 * 3600 * 1000) {
    return NextResponse.json({ error: 'STAY_ALREADY_STARTED' }, { status: 409 });
  }

  const serialized = serializeBriefingForm(payload);
  const now = new Date();

  const wasFirstSubmission = !(await prisma.preStayBriefing.findUnique({
    where: { bookingId: id },
    select: { submittedAt: true },
  }))?.submittedAt;

  await prisma.preStayBriefing.upsert({
    where: { bookingId: id },
    update: { formData: serialized, submittedAt: now },
    create: { bookingId: id, formData: serialized, submittedAt: now },
  });

  // Notify admins on the FIRST submission (or first non-empty submission
  // after a previously blank one).  Subsequent edits are silent — clients
  // can refine without spamming the team.
  if (wasFirstSubmission) {
    const petName = booking.bookingPets[0]?.pet?.name ?? '';
    try {
      await createAdminNotifications({
        type: 'PRE_STAY_BRIEFING_SUBMITTED',
        titleFr: '📝 Briefing reçu',
        titleEn: '📝 Briefing received',
        messageFr: petName
          ? `Le briefing pré-séjour de ${petName} est arrivé.`
          : 'Un briefing pré-séjour vient d\'arriver.',
        messageEn: petName
          ? `${petName}'s pre-stay briefing has arrived.`
          : 'A pre-stay briefing has just arrived.',
        metadata: { bookingId: booking.id },
      });
    } catch (err) {
      logger.error('pre-stay-briefing', 'ADMIN_NOTIF_FAILED', {
        bookingId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await logAction({
      userId: session.user.id,
      action: 'PRE_STAY_BRIEFING_SUBMITTED',
      entityType: 'PreStayBriefing',
      entityId: booking.id,
      details: { bookingId: booking.id },
    });
  }

  return NextResponse.json({ ok: true, submittedAt: now.toISOString() });
}
