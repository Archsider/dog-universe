import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { formatDateFR } from '@/lib/sms';
import { sendSmsNow } from '@/lib/notify-now';
import { bookingClientCancelSchema, bookingClientRescheduleSchema, formatZodError } from '@/lib/validation';
import { createNotification } from '@/lib/notifications';
import { logger } from '@/lib/logger';
import { invalidateAvailabilityCache } from '@/lib/availability-cache';
import { notDeleted } from '@/lib/prisma-soft';
import { withSpan } from '@/lib/observability';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id }),
    include: {
      client: { select: { id: true, name: true, email: true, language: true } },
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      taxiDetail: true,
      invoice: true,
    },
  });

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.user.role === 'CLIENT' && booking.clientId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(booking);
}

// PATCH /api/bookings/[id] is the CLIENT-ONLY mutation surface for a booking.
// Only two operations are allowed:
//   1. Self-cancel (PENDING / CONFIRMED → CANCELLED with cancellationReason)
//   2. Reschedule REQUEST (creates a RescheduleRequest row, does not move dates)
// Admin and SUPERADMIN must use PATCH /api/admin/bookings/[id], which enforces
// version locking, status-transition guards, capacity recheck, audit logs and
// cancellation-reason requirements. Allowing admin operations on the public
// route would silently bypass all of those protections, which has historically
// caused production incidents — the route is now hard-gated to CLIENT.
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  return withSpan(
    'api.bookings.client_patch',
    { entityId: id },
    () => patchImpl(request, id),
  );
}

async function patchImpl(request: Request, id: string): Promise<Response> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.user.role !== 'CLIENT') {
    return NextResponse.json(
      {
        error: 'ADMIN_PATH_FORBIDDEN',
        message: 'Use PATCH /api/admin/bookings/[id] for admin operations.',
      },
      { status: 403 },
    );
  }

  const body = await request.json();

  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id }),
    include: {
      client: true,
      bookingPets: { include: { pet: true } },
    },
  });

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (booking.clientId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Reschedule request (client asks for new dates — admin must approve) ──
  const isReschedule = body && (body.requestedStartDate || body.requestedScheduledAt);
  if (isReschedule) {
    const parsedR = bookingClientRescheduleSchema.safeParse(body);
    if (!parsedR.success) {
      return NextResponse.json(formatZodError(parsedR.error), { status: 400 });
    }
    if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
      return NextResponse.json({ error: 'Cannot reschedule this booking' }, { status: 400 });
    }
    const oldStart = booking.startDate.toISOString();
    const oldEnd = booking.endDate?.toISOString() ?? null;
    const newStart = parsedR.data.requestedStartDate ?? parsedR.data.requestedScheduledAt!;
    const newEnd = parsedR.data.requestedEndDate ?? null;
    // Validate ordering for BOARDING
    if (parsedR.data.requestedStartDate && parsedR.data.requestedEndDate) {
      if (new Date(newEnd!) <= new Date(newStart)) {
        return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
      }
    }

    // Persist the reschedule request in its dedicated table (one open request
    // per booking — upsert). Legacy rescheduleRequest tags previously embedded
    // in `notes` are intentionally NOT migrated; admins handle leftover notes
    // manually until they age out.
    const newStartDt = new Date(newStart);
    const newEndDt = newEnd ? new Date(newEnd) : null;
    await prisma.rescheduleRequest.upsert({
      where: { bookingId: id },
      update: {
        startDate: newStartDt,
        endDate: newEndDt,
        reason: parsedR.data.rescheduleNote ?? null,
        status: 'PENDING',
        resolvedAt: null,
      },
      create: {
        bookingId: id,
        startDate: newStartDt,
        endDate: newEndDt,
        reason: parsedR.data.rescheduleNote ?? null,
      },
    });

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: 'PENDING', // re-validation required
      },
      include: { client: true, bookingPets: { include: { pet: true } } },
    });

    await logAction({
      userId: session.user.id,
      action: 'BOOKING_RESCHEDULE_REQUESTED',
      entityType: 'Booking',
      entityId: id,
      details: { oldStart, oldEnd, newStart, newEnd },
    });

    // Reschedule moves the booking back to PENDING — counted by availability.
    if (booking.serviceType === 'BOARDING') {
      await invalidateAvailabilityCache(booking.startDate, booking.endDate);
    }

    // Notify all admins (in-app)
    try {
      const admins = await prisma.user.findMany({
        where: { ...notDeleted(), role: { in: ['ADMIN', 'SUPERADMIN'] } },
        select: { id: true },
      });
      const petNames = booking.bookingPets.map(bp => bp.pet.name).join(' et ') || 'animal';
      const clientName = booking.client.name ?? booking.client.email;
      const newStartFr = formatDateFR(new Date(newStart));
      const newEndFr = newEnd ? formatDateFR(new Date(newEnd)) : null;
      const dateLabelFr = newEndFr ? `du ${newStartFr} au ${newEndFr}` : `le ${newStartFr}`;
      const dateLabelEn = newEndFr ? `from ${newStartFr} to ${newEndFr}` : `on ${newStartFr}`;
      await Promise.all(
        admins.map(admin => createNotification({
          userId: admin.id,
          type: 'BOOKING_RESCHEDULE_REQUEST',
          titleFr: `Changement de dates — ${clientName}`,
          titleEn: `Reschedule request — ${clientName}`,
          messageFr: `${clientName} demande à déplacer ${petNames} ${dateLabelFr}.`,
          messageEn: `${clientName} requests moving ${petNames} ${dateLabelEn}.`,
          metadata: { bookingId: id },
        }).catch(() => { /* non-blocking */ })),
      );
    } catch (err) {
      logger.error('booking', 'admin reschedule notif failed', { error: err instanceof Error ? err.message : String(err) });
    }

    return NextResponse.json(updated);
  }

  // Validation Zod stricte du body côté client (force status=CANCELLED + cancellationReason ≤ 500)
  const parsed = bookingClientCancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }
  if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
    return NextResponse.json({ error: 'Cannot cancel this booking' }, { status: 400 });
  }
  const updated = await prisma.booking.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      cancellationReason: parsed.data.cancellationReason ?? null,
    },
    include: { client: true, bookingPets: { include: { pet: true } } },
  });
  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.BOOKING_CANCELLED,
    entityType: 'Booking',
    entityId: id,
  });

  // Cancellation removes the booking from the active set in availability.
  if (booking.serviceType === 'BOARDING') {
    await invalidateAvailabilityCache(booking.startDate, booking.endDate);
  }

  // ── Notifications admin (SMS + in-app) — annulation initiée par le client ─
  const cancelPetNames = booking.bookingPets.map(bp => bp.pet.name).join(' et ') || 'votre animal';
  const cancelClientName = booking.client.name ?? booking.client.email;
  const cancelDateRange = booking.endDate
    ? `du ${formatDateFR(booking.startDate)} au ${formatDateFR(booking.endDate)}`
    : `le ${formatDateFR(booking.startDate)}`;
  const cancelDateRangeEn = booking.endDate
    ? `from ${formatDateFR(booking.startDate)} to ${formatDateFR(booking.endDate)}`
    : `on ${formatDateFR(booking.startDate)}`;

  // Fire-and-forget via sendSmsNow — atomic SmsLog reservation prevents
  // duplicate admin SMS on race conditions (concurrent cancel requests).
  sendSmsNow({
    to: 'ADMIN',
    message: `⚠️ Annulation client : ${cancelClientName} a annulé sa réservation pour ${cancelPetNames} ${cancelDateRange}.`,
  });

  try {
    const admins = await prisma.user.findMany({
      where: { ...notDeleted(), role: { in: ['ADMIN', 'SUPERADMIN'] } },
      select: { id: true },
    });
    await Promise.all(
      admins.map(admin =>
        prisma.notification.create({
          data: {
            userId: admin.id,
            type: 'BOOKING_CANCELLED',
            titleFr: `Annulation — ${cancelClientName}`,
            titleEn: `Cancelled — ${cancelClientName}`,
            messageFr: `${cancelPetNames} ${cancelDateRange} a été annulée par le client.`,
            messageEn: `${cancelPetNames} ${cancelDateRangeEn} was cancelled by the client.`,
            metadata: JSON.stringify({ bookingId: id }),
            read: false,
          },
        }).catch(err => logger.error('booking', 'admin cancel notification failed', { error: err instanceof Error ? err.message : String(err) })),
      ),
    );
  } catch (err) {
    logger.error('booking', 'admin lookup failed on client cancel', { error: err instanceof Error ? err.message : String(err) });
  }

  return NextResponse.json(updated);
}
