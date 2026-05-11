/**
 * Status transition + post-transition side effects for admin booking PATCH.
 *
 * Three functions:
 *  - `applyStatusUpdate`: the actual `prisma.booking.update` (Sentry-spanned).
 *  - `handleNoShowInvoice`: NO_SHOW invoice cancellation + product restocking.
 *  - `runStatusSideEffects`: notifications, email, SMS, audit log, loyalty
 *    recalculation, waitlist promotion. Fire-and-forget side effects must
 *    never fail the HTTP response.
 *
 * Kept separate from the route so the route stays a router.
 */
import { prisma } from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { log } from '@/lib/logger';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import {
  createBookingValidationNotification,
  createBookingRefusalNotification,
  createBookingInProgressNotification,
  createBookingCompletedNotification,
  createBookingNoShowNotification,
  promoteWaitlistedBooking,
} from '@/lib/notifications';
import { getEmailTemplate } from '@/lib/email';
import {
  formatDateFR, petVerb, petArrived, petChouchoute,
} from '@/lib/sms';
import { sendEmailNow, sendSmsNow } from '@/lib/notify-now';

type BookingForStatus = {
  id: string;
  status: string;
  serviceType: string;
  startDate: Date;
  endDate: Date | null;
  arrivalTime: string | null;
  clientId: string;
  client: {
    name: string | null;
    email: string;
    phone: string | null;
    language: string | null;
  };
  bookingPets: Array<{ pet: { id: string; name: string; species: string; gender: string | null } }>;
  boardingDetail: { includeGrooming: boolean } | null;
  taxiDetail: { taxiType: string | null } | null;
};

export interface ApplyStatusUpdateArgs {
  bookingId: string;
  status?: string;
  notes?: string;
  cancellationReason?: string;
}

export async function applyStatusUpdate(args: ApplyStatusUpdateArgs) {
  const { bookingId, status, notes, cancellationReason } = args;
  return Sentry.startSpan(
    { name: 'db.booking.update', op: 'db', attributes: { bookingId, newStatus: status ?? '' } },
    () => prisma.booking.update({
      where: { id: bookingId },
      data: {
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
        ...(cancellationReason !== undefined && { cancellationReason }),
        version: { increment: 1 },
      },
    }),
  );
}

export interface NoShowInvoiceHandlingArgs {
  bookingId: string;
  actorId: string;
  previousStatus: string;
}

export async function handleNoShowInvoice(args: NoShowInvoiceHandlingArgs) {
  const { bookingId, actorId, previousStatus } = args;
  if (previousStatus === 'NO_SHOW') return;

  const inv = await prisma.invoice.findUnique({
    where: { bookingId },
    select: {
      id: true,
      status: true,
      paidAmount: true,
      items: { where: { productId: { not: null } }, select: { productId: true, quantity: true } },
    },
  });
  if (!inv || inv.status === 'CANCELLED') return;

  const isPaidOrPartial = inv.status === 'PAID' || inv.status === 'PARTIALLY_PAID';

  if (isPaidOrPartial) {
    console.warn(JSON.stringify({
      level: 'warn',
      service: 'no-show',
      message: 'invoice already paid, kept as-is',
      invoiceId: inv.id,
      paidAmount: Number(inv.paidAmount),
      bookingId,
    }));
    await logAction({
      userId: actorId,
      action: 'NO_SHOW_INVOICE_PAID_KEPT',
      entityType: 'Invoice',
      entityId: inv.id,
      details: { paidAmount: Number(inv.paidAmount), bookingId, invoiceStatus: inv.status },
    });
    if (inv.items.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const it of inv.items) {
          if (!it.productId) continue;
          const product = await tx.product.findUnique({
            where: { id: it.productId },
            select: { available: true, stock: true },
          });
          if (!product) continue;
          const newStock = product.stock + it.quantity;
          await tx.product.update({
            where: { id: it.productId },
            data: {
              stock: { increment: it.quantity },
              ...(!product.available && newStock > 0 ? { available: true } : {}),
            },
          });
        }
      });
    }
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: inv.id },
        data: { status: 'CANCELLED' },
      });
      for (const it of inv.items) {
        if (!it.productId) continue;
        const product = await tx.product.findUnique({
          where: { id: it.productId },
          select: { available: true, stock: true },
        });
        if (!product) continue;
        const newStock = product.stock + it.quantity;
        await tx.product.update({
          where: { id: it.productId },
          data: {
            stock: { increment: it.quantity },
            ...(!product.available && newStock > 0 ? { available: true } : {}),
          },
        });
      }
    });
  }
}

export interface RunStatusSideEffectsArgs {
  booking: BookingForStatus;
  newStatus: string;
  actorId: string;
}

export async function runStatusSideEffects(args: RunStatusSideEffectsArgs) {
  const { booking, newStatus, actorId } = args;
  const userLang = booking.client.language || 'fr';
  const pets = booking.bookingPets.map(bp => bp.pet);
  const petNames = pets.map(p => p.name).join(' et ');
  const firstName = (booking.client.name ?? booking.client.email).split(' ')[0];
  const bookingRef = booking.id.slice(0, 8).toUpperCase();

  if (newStatus === 'CONFIRMED') {
    const fmtLocale = userLang === 'fr' ? 'fr-MA' : 'en-GB';
    const startDateFmt = booking.startDate.toLocaleDateString(fmtLocale);
    const endDateFmt = booking.endDate ? booking.endDate.toLocaleDateString(fmtLocale) : '';
    const dates = endDateFmt ? `${startDateFmt} – ${endDateFmt}` : startDateFmt;
    await createBookingValidationNotification(booking.clientId, bookingRef, petNames, dates);
    const { subject, html } = getEmailTemplate('booking_validated', {
      clientName: booking.client.name ?? booking.client.email,
      bookingRef,
      service: booking.serviceType === 'BOARDING' ? (userLang === 'fr' ? 'Pension' : 'Boarding') : 'Pet Taxi',
      petName: petNames,
      startDate: startDateFmt,
      endDate: endDateFmt,
    }, userLang, pets);
    sendEmailNow({ to: booking.client.email, subject, html });

    const dateRange = booking.serviceType === 'BOARDING' && booking.endDate
      ? `du ${formatDateFR(booking.startDate)} au ${formatDateFR(booking.endDate)}`
      : `le ${formatDateFR(booking.startDate)}`;
    const venueLine = booking.serviceType === 'BOARDING'
      ? `${petNames} ${petVerb(pets)} chez Dog Universe ${dateRange}. Nous ${pets.length > 1 ? 'les' : "l'"} attendons avec impatience !`
      : `Transport prévu pour ${petNames} ${dateRange}.`;
    sendSmsNow({ to: booking.client.phone, message: `Bonjour ${firstName} ! ${venueLine} — Dog Universe 🐾` });

    const confirmRangeAdmin = booking.serviceType === 'BOARDING' && booking.endDate
      ? ` du ${formatDateFR(booking.startDate)} au ${formatDateFR(booking.endDate)}`
      : ` le ${formatDateFR(booking.startDate)}`;
    sendSmsNow({ to: 'ADMIN', message: `✅ Résa confirmée : ${petNames} de ${booking.client.name}${confirmRangeAdmin}.` });

    if (booking.serviceType === 'PET_TAXI') {
      const existingTrip = await prisma.taxiTrip.findFirst({ where: { bookingId: booking.id } });
      if (!existingTrip) {
        const dateStr = booking.startDate.toISOString().slice(0, 10);
        const t = await prisma.taxiTrip.create({
          data: {
            bookingId: booking.id,
            tripType: 'STANDALONE',
            status: 'PLANNED',
            date: dateStr,
            time: booking.arrivalTime ?? undefined,
            taxiType: booking.taxiDetail?.taxiType ?? undefined,
          },
        });
        await prisma.taxiStatusHistory.create({ data: { taxiTripId: t.id, status: 'PLANNED', updatedBy: actorId } });
      }
    }

    await logAction({
      userId: actorId,
      action: LOG_ACTIONS.BOOKING_CONFIRMED,
      entityType: 'Booking',
      entityId: booking.id,
      details: { from: booking.status, to: newStatus },
    });
  } else if (newStatus === 'REJECTED' || newStatus === 'CANCELLED') {
    const wasActiveSlot = booking.status !== 'WAITLIST';

    if (wasActiveSlot) {
      await createBookingRefusalNotification(booking.clientId, bookingRef);
      const { subject, html } = getEmailTemplate('booking_refused', {
        clientName: booking.client.name ?? booking.client.email,
        bookingRef,
        petName: petNames,
      }, userLang, pets);
      sendEmailNow({ to: booking.client.email, subject, html });

      const refusedSmsMsg = userLang === 'en'
        ? `Hello ${firstName}, your booking for ${petNames} has been cancelled. We remain available. — Dog Universe`
        : `Bonjour ${firstName}, votre réservation pour ${petNames} a été annulée. Nous restons disponibles. — Dog Universe`;
      sendSmsNow({ to: booking.client.phone, message: refusedSmsMsg });
      const adminDateRange = booking.serviceType === 'BOARDING' && booking.endDate
        ? ` du ${formatDateFR(booking.startDate)} au ${formatDateFR(booking.endDate)}`
        : ` le ${formatDateFR(booking.startDate)}`;
      sendSmsNow({ to: 'ADMIN', message: `⚠️ Annulation : ${petNames} de ${booking.client.name}${adminDateRange}.` });
    }

    await logAction({
      userId: actorId,
      action: newStatus === 'REJECTED' ? LOG_ACTIONS.BOOKING_REJECTED : LOG_ACTIONS.BOOKING_CANCELLED,
      entityType: 'Booking',
      entityId: booking.id,
      details: { from: booking.status, to: newStatus, wasWaitlist: !wasActiveSlot },
    });

    if (wasActiveSlot && booking.serviceType === 'BOARDING' && booking.endDate) {
      promoteWaitlistedBooking({
        startDate: booking.startDate,
        endDate: booking.endDate,
      }).catch(async (err) => log('error', 'admin-booking', 'waitlist promotion failed', { error: err instanceof Error ? err.message : String(err) }));
    }
  } else if (newStatus === 'NO_SHOW') {
    await createBookingNoShowNotification(booking.clientId, bookingRef, petNames);

    sendSmsNow({ to: 'ADMIN', message: `🚫 No Show : ${petNames} de ${booking.client.name} (réf. ${bookingRef}).` });

    await logAction({
      userId: actorId,
      action: LOG_ACTIONS.BOOKING_CANCELLED,
      entityType: 'Booking',
      entityId: booking.id,
      details: { from: booking.status, to: 'NO_SHOW' },
    });

    if (booking.serviceType === 'BOARDING' && booking.endDate) {
      promoteWaitlistedBooking({
        startDate: booking.startDate,
        endDate: booking.endDate,
      }).catch(async (err) => log('error', 'admin-booking', 'waitlist promotion failed', { error: err instanceof Error ? err.message : String(err) }));
    }
  } else if (newStatus === 'COMPLETED') {
    const hasGrooming = booking.boardingDetail?.includeGrooming ?? false;
    await createBookingCompletedNotification(
      booking.clientId,
      bookingRef,
      petNames,
      booking.serviceType as 'BOARDING' | 'PET_TAXI',
      hasGrooming
    );

    sendSmsNow({ to: booking.client.phone, message: `Bonjour ${firstName} ! Le séjour de ${petNames} est terminé. Ce fut un plaisir de ${pets.length > 1 ? 'les' : "l'"} accueillir. À très bientôt ! — Dog Universe 🐾` });
    sendSmsNow({ to: 'ADMIN', message: `✅ Départ : ${petNames} de ${booking.client.name} a quitté la pension.` });

    await logAction({
      userId: actorId,
      action: LOG_ACTIONS.BOOKING_COMPLETED,
      entityType: 'Booking',
      entityId: booking.id,
      details: { from: booking.status, to: newStatus },
    });

    try {
      const { calculateSuggestedGrade } = await import('@/lib/loyalty');
      const { createLoyaltyUpdateNotification } = await import('@/lib/notifications');
      const [totalStays, totalPaid, currentGrade] = await Promise.all([
        prisma.booking.count({ where: { clientId: booking.clientId, status: 'COMPLETED', deletedAt: null } }),
        prisma.invoice.aggregate({ where: { clientId: booking.clientId, status: 'PAID' }, _sum: { amount: true } }),
        prisma.loyaltyGrade.findUnique({ where: { clientId: booking.clientId } }),
      ]);
      const suggestedGrade = calculateSuggestedGrade(totalStays, Number(totalPaid._sum.amount ?? 0));
      if (!currentGrade?.isOverride && currentGrade?.grade !== suggestedGrade) {
        await prisma.loyaltyGrade.upsert({
          where: { clientId: booking.clientId },
          update: { grade: suggestedGrade },
          create: { clientId: booking.clientId, grade: suggestedGrade },
        });
        const { invalidateLoyaltyCache } = await import('@/lib/loyalty-server');
        await invalidateLoyaltyCache(booking.clientId);
        await createLoyaltyUpdateNotification(booking.clientId, suggestedGrade, booking.client.language || 'fr');
      }
    } catch { /* non-blocking */ }
  } else if (newStatus === 'IN_PROGRESS') {
    await createBookingInProgressNotification(
      booking.clientId,
      bookingRef,
      petNames,
      booking.serviceType as 'BOARDING' | 'PET_TAXI'
    );

    const hasTaxiDelivered = await prisma.taxiTrip.findFirst({
      where: {
        bookingId: booking.id,
        tripType: 'STANDALONE',
        status: 'ARRIVED_AT_PENSION',
      },
      select: { id: true },
    });
    if (!hasTaxiDelivered) {
      sendSmsNow({ to: booking.client.phone, message: `Bonjour ${firstName} ! ${petNames} ${petVerb(pets, 'present')} bien ${petArrived(pets)} et déjà ${petChouchoute(pets)}. Nous en prenons soin. — Dog Universe 🐾` });
    }

    sendSmsNow({ to: 'ADMIN', message: `🏠 Arrivée : ${petNames} de ${booking.client.name} est en pension.` });

    await logAction({
      userId: actorId,
      action: 'BOOKING_IN_PROGRESS',
      entityType: 'Booking',
      entityId: booking.id,
      details: { from: booking.status, to: newStatus },
    });
  }
}
