import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { createBookingValidationNotification, createBookingRefusalNotification, createBookingCompletedNotification } from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { sendAdminSMS, formatDateFR } from '@/lib/sms';
import { bookingClientCancelSchema, bookingClientRescheduleSchema, formatZodError } from '@/lib/validation';
import { createNotification } from '@/lib/notifications';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const booking = await prisma.booking.findFirst({
    where: { id, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
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

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const booking = await prisma.booking.findFirst({
    where: { id, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
    include: {
      client: true,
      bookingPets: { include: { pet: true } },
    },
  });

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Client path — strictly isolated: only cancel OR reschedule request allowed
  if (session.user.role === 'CLIENT') {
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
      // Persist as a structured tag prepended to notes (no schema change — Booking has no metadata column)
      const rescheduleTag = JSON.stringify({
        rescheduleRequest: {
          requestedAt: new Date().toISOString(),
          oldStart,
          oldEnd,
          newStart,
          newEnd,
          note: parsedR.data.rescheduleNote ?? null,
        },
      });
      const existingNotes = booking.notes ?? '';
      const cleanedNotes = existingNotes.replace(/\[RESCHEDULE_REQUEST\]\{[^}]*\}\{[^}]*\}/g, '').trim();
      const newNotes = `[RESCHEDULE_REQUEST]${rescheduleTag}\n${cleanedNotes}`.trim();

      const updated = await prisma.booking.update({
        where: { id },
        data: {
          status: 'PENDING', // re-validation required
          notes: newNotes,
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

      // Notify all admins (in-app)
      try {
        const admins = await prisma.user.findMany({
          where: { role: { in: ['ADMIN', 'SUPERADMIN'] }, deletedAt: null },
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
        console.error(JSON.stringify({ level: 'error', service: 'booking', message: 'admin reschedule notif failed', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
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

    // ── Notifications admin (SMS + in-app) — annulation initiée par le client ─
    const cancelPetNames = booking.bookingPets.map(bp => bp.pet.name).join(' et ') || 'votre animal';
    const cancelClientName = booking.client.name ?? booking.client.email;
    const cancelDateRange = booking.endDate
      ? `du ${formatDateFR(booking.startDate)} au ${formatDateFR(booking.endDate)}`
      : `le ${formatDateFR(booking.startDate)}`;
    const cancelDateRangeEn = booking.endDate
      ? `from ${formatDateFR(booking.startDate)} to ${formatDateFR(booking.endDate)}`
      : `on ${formatDateFR(booking.startDate)}`;

    sendAdminSMS(
      `⚠️ Annulation client : ${cancelClientName} a annulé sa réservation pour ${cancelPetNames} ${cancelDateRange}.`,
    ).catch(() => { /* SMS additif — échec non bloquant */ });

    try {
      const admins = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'SUPERADMIN'] }, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
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
          }).catch(err => console.error(JSON.stringify({ level: 'error', service: 'booking', message: 'admin cancel notification failed', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }))),
        ),
      );
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', service: 'booking', message: 'admin lookup failed on client cancel', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
    }

    return NextResponse.json(updated);
  }

  // Admin path — explicit role check (defensive guard)
  if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updateData: Record<string, unknown> = {};

  const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'CANCELLED', 'REJECTED', 'COMPLETED'];
  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  if (body.status) updateData.status = body.status;
  if (body.notes !== undefined) updateData.notes = body.notes;
  if (body.cancellationReason !== undefined) updateData.cancellationReason = body.cancellationReason;
  if (body.totalPrice !== undefined) {
    const price = Number(body.totalPrice);
    // Reject NaN, Infinity, negative, and absurd values (max 1 000 000 MAD).
    // Without these checks, an admin typo or bad client request can yield
    // negative invoices or overflow rounding when computing payments.
    if (!Number.isFinite(price) || price < 0 || price > 1_000_000) {
      return NextResponse.json({ error: 'INVALID_TOTAL_PRICE' }, { status: 400 });
    }
    updateData.totalPrice = Math.round(price * 100) / 100;
  }
  if (body.startDate) {
    const d = new Date(body.startDate);
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid startDate' }, { status: 400 });
    updateData.startDate = d;
  }
  if (body.endDate) {
    const d = new Date(body.endDate);
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid endDate' }, { status: 400 });
    updateData.endDate = d;
  }
  if (body.arrivalTime !== undefined) updateData.arrivalTime = body.arrivalTime;

  // Validate date ordering
  const resolvedStart = (updateData.startDate as Date | undefined) ?? booking.startDate;
  const resolvedEnd = (updateData.endDate as Date | undefined) ?? booking.endDate;
  if (resolvedStart && resolvedEnd && resolvedEnd <= resolvedStart) {
    return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: updateData,
    include: { client: true, bookingPets: { include: { pet: true } } },
  });

  const locale = updated.client.language ?? 'fr';
  const pets = updated.bookingPets.map((bp) => bp.pet);
  const petNames = pets.map((p) => p.name).join(', ');

  // Send notifications based on status change
  if (body.status === 'CONFIRMED') {
    const fmtLocale = locale === 'fr' ? 'fr-MA' : 'en-GB';
    const startDateFmt = updated.startDate ? updated.startDate.toLocaleDateString(fmtLocale) : '';
    const endDateFmt = updated.endDate ? updated.endDate.toLocaleDateString(fmtLocale) : '';
    const dates = startDateFmt
      ? `${startDateFmt}${endDateFmt ? ` – ${endDateFmt}` : ''}`
      : '';

    await createBookingValidationNotification(updated.clientId, id, petNames, dates);

    const serviceLabel = updated.serviceType === 'BOARDING'
      ? (locale === 'fr' ? 'Pension' : 'Boarding')
      : (locale === 'fr' ? 'Taxi' : 'Taxi');

    const { subject, html } = getEmailTemplate('booking_validated', {
      clientName: updated.client.name,
      bookingRef: id,
      service: serviceLabel,
      petName: petNames,
      startDate: startDateFmt,
      endDate: endDateFmt,
    }, locale, pets);

    sendEmail({ to: updated.client.email, subject, html }).catch(() => {});

    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.BOOKING_CONFIRMED,
      entityType: 'Booking',
      entityId: id,
    });
  }

  if (body.status === 'CANCELLED') {
    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.BOOKING_CANCELLED,
      entityType: 'Booking',
      entityId: id,
    });
  }

  if (body.status === 'COMPLETED') {
    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.BOOKING_COMPLETED,
      entityType: 'Booking',
      entityId: id,
    });

    // Notify client (non-blocking)
    createBookingCompletedNotification(
      updated.clientId,
      id,
      petNames,
      updated.serviceType as 'BOARDING' | 'PET_TAXI',
    ).catch(() => {});
  }

  if (body.status === 'CANCELLED' && (session.user.role === 'ADMIN' || session.user.role === 'SUPERADMIN')) {
    await createBookingRefusalNotification(updated.clientId, id, body.reason);
    const { subject, html } = getEmailTemplate('booking_refused', {
      clientName: updated.client.name,
      bookingRef: id,
      reason: body.reason ?? '',
    }, locale);
    sendEmail({ to: updated.client.email, subject, html }).catch(() => {});
    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.BOOKING_REJECTED,
      entityType: 'Booking',
      entityId: id,
      details: { reason: body.reason },
    });
  }

  // Update grooming add-on if admin changes it
  if (session.user.role === 'ADMIN' && body.includeGrooming !== undefined) {
    await prisma.boardingDetail.upsert({
      where: { bookingId: id },
      update: {
        includeGrooming: body.includeGrooming,
        groomingSize: body.groomingSize,
        groomingPrice: body.groomingPrice ?? 0,
      },
      create: {
        bookingId: id,
        includeGrooming: body.includeGrooming,
        groomingSize: body.groomingSize,
        groomingPrice: body.groomingPrice ?? 0,
        pricePerNight: body.pricePerNight ?? 200,
      },
    });
  }

  return NextResponse.json(updated);
}
