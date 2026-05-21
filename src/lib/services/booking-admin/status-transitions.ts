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
import { BookingStatus } from '@prisma/client';
import * as Sentry from '@sentry/nextjs';
import { log, logger } from '@/lib/logger';
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
import { sendEmailNow, sendSmsNow, sendSmsRespectful } from '@/lib/notify-now';
import { ServiceType } from './constants';
import { notDeleted } from '@/lib/prisma-soft';
import { withSpan } from '@/lib/observability';
import { casablancaDateOnly } from '@/lib/dates-casablanca';

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
    /** Walk-in flag — drives the COMPTA SMS suppression policy
     *  (`docs/adr/0008-respectful-sms-policy.md`). Always loaded by the
     *  PATCH dispatcher which `include: { client: true }`. */
    isWalkIn: boolean;
  };
  bookingPets: Array<{ pet: { id: string; name: string; species: string; gender: string | null } }>;
  boardingDetail: { includeGrooming: boolean } | null;
  taxiDetail: { taxiType: string | null } | null;
};

export interface ApplyStatusUpdateArgs {
  bookingId: string;
  status?: BookingStatus;
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
  return withSpan(
    'booking.admin.handleNoShowInvoice',
    { bookingId: args.bookingId, previousStatus: args.previousStatus },
    () => handleNoShowInvoiceImpl(args),
  );
}

async function handleNoShowInvoiceImpl(args: NoShowInvoiceHandlingArgs) {
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
    logger.warn('no-show', 'invoice already paid, kept as-is', {
      invoiceId: inv.id,
      paidAmount: Number(inv.paidAmount),
      bookingId,
    });
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
  return withSpan(
    'booking.admin.runStatusSideEffects',
    {
      bookingId: args.booking.id,
      serviceType: args.booking.serviceType,
      newStatus: args.newStatus,
      previousStatus: args.booking.status,
    },
    () => runStatusSideEffectsImpl(args),
  );
}

async function runStatusSideEffectsImpl(args: RunStatusSideEffectsArgs) {
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
      service: booking.serviceType === ServiceType.BOARDING ? (userLang === 'fr' ? 'Pension' : 'Boarding') : 'Pet Taxi',
      petName: petNames,
      startDate: startDateFmt,
      endDate: endDateFmt,
    }, userLang, pets);
    sendEmailNow({ to: booking.client.email, subject, html });

    const dateRange = booking.serviceType === ServiceType.BOARDING && booking.endDate
      ? `du ${formatDateFR(booking.startDate)} au ${formatDateFR(booking.endDate)}`
      : `le ${formatDateFR(booking.startDate)}`;
    const venueLine = booking.serviceType === ServiceType.BOARDING
      ? `${petNames} ${petVerb(pets)} chez Dog Universe ${dateRange}. Nous ${pets.length > 1 ? 'les' : "l'"} attendons avec impatience !`
      : `Transport prévu pour ${petNames} ${dateRange}.`;
    sendSmsNow({ to: booking.client.phone, message: `Bonjour ${firstName} ! ${venueLine} — Dog Universe 🐾` });

    const confirmRangeAdmin = booking.serviceType === ServiceType.BOARDING && booking.endDate
      ? ` du ${formatDateFR(booking.startDate)} au ${formatDateFR(booking.endDate)}`
      : ` le ${formatDateFR(booking.startDate)}`;
    sendSmsNow({ to: 'ADMIN', message: `✅ Résa confirmée : ${petNames} de ${booking.client.name}${confirmRangeAdmin}.` });

    if (booking.serviceType === ServiceType.PET_TAXI) {
      const existingTrip = await prisma.taxiTrip.findFirst({ where: { bookingId: booking.id } });
      if (!existingTrip) {
        // Casa-anchored : a booking at 22:00–23:59 UTC = 23:00–00:59 Casa
        // next day would otherwise land on the wrong driver dashboard day.
        const dateStr = casablancaDateOnly(booking.startDate);
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
      const adminDateRange = booking.serviceType === ServiceType.BOARDING && booking.endDate
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

    if (wasActiveSlot && booking.serviceType === ServiceType.BOARDING && booking.endDate) {
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

    if (booking.serviceType === ServiceType.BOARDING && booking.endDate) {
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

    // Client SMS = COMPTA: a "stay finished" message is non-urgent (animal
    // is already home or on its way), so it respects walk-in skip + quiet
    // hours per the respectful-SMS policy. Admin SMS = OPS (operator wants
    // to see the close happened, even at 23h doing accounting catch-up).
    sendSmsRespectful(
      {
        to: booking.client.phone,
        message: `Bonjour ${firstName} ! Le séjour de ${petNames} est terminé. Ce fut un plaisir de ${pets.length > 1 ? 'les' : "l'"} accueillir. À très bientôt ! — Dog Universe 🐾`,
      },
      {
        category: 'COMPTA',
        recipient: booking.client.isWalkIn ? 'walkin' : 'standard',
      },
    );
    sendSmsNow({ to: 'ADMIN', message: `✅ Départ : ${petNames} de ${booking.client.name} a quitté la pension.` });

    await logAction({
      userId: actorId,
      action: LOG_ACTIONS.BOOKING_COMPLETED,
      entityType: 'Booking',
      entityId: booking.id,
      details: { from: booking.status, to: newStatus },
    });

    // Cascade: any TaxiTrip attached to this booking that is still in a
    // non-terminal status becomes a "zombie" once the parent Booking is
    // COMPLETED — the driver dashboard pivots on TaxiTrip.status, so a
    // forgotten ANIMAL_ON_BOARD trip kept showing "Course en cours" days
    // after the stay was closed. We finalize each leg here using its
    // type-specific terminal status (OUTBOUND/STANDALONE land at the
    // pension, RETURN lands at the client), record a history row with a
    // synthetic actorId, and clear the live-tracking metadata so the
    // /track/[token] SSE page stops serving a stale state. Failure is
    // non-fatal — we never block the parent booking completion.
    try {
      await finalizeTaxiTripsForBooking(booking.id, actorId);
    } catch (err) {
      log('error', 'admin-booking', 'failed to finalize taxi trips on booking complete', {
        bookingId: booking.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      const { calculateSuggestedGrade } = await import('@/lib/loyalty');
      const { createLoyaltyUpdateNotification } = await import('@/lib/notifications');
      // Filter out invoices linked to soft-deleted bookings — otherwise a
      // legacy CANCELLED+soft-deleted booking with a PAID invoice keeps
      // inflating the totalSpentMAD used for PLATINUM threshold.  Also
      // pull `historicalSpendMAD` (clients migrated with pre-app history)
      // so the suggestion is parity with the canonical payments.ts path.
      const [totalStays, totalPaid, client, currentGrade] = await Promise.all([
        prisma.booking.count({ where: notDeleted({ clientId: booking.clientId, status: 'COMPLETED' }) }),
        prisma.invoice.aggregate({
          where: {
            clientId: booking.clientId,
            status: 'PAID',
            booking: { deletedAt: null }, // -- OK: explicit filter on relation, no helper available
          },
          _sum: { amount: true },
        }),
        prisma.user.findUnique({
          where: { id: booking.clientId },
          select: { historicalSpendMAD: true },
        }),
        prisma.loyaltyGrade.findUnique({ where: { clientId: booking.clientId } }),
      ]);
      const liveRevenue = Number(totalPaid._sum.amount ?? 0);
      const historical = Number(client?.historicalSpendMAD ?? 0);
      const suggestedGrade = calculateSuggestedGrade(totalStays, liveRevenue + historical);
      if (!currentGrade?.isOverride && currentGrade?.grade !== suggestedGrade) {
        // Optimistic-lock guard against concurrent override admin actions :
        // updateMany with isOverride: false matches only if no override has
        // landed between our read and write.  upsert would clobber blindly.
        const writeResult = await prisma.loyaltyGrade.updateMany({
          where: { clientId: booking.clientId, isOverride: false },
          data:  { grade: suggestedGrade },
        });
        if (writeResult.count === 0 && !currentGrade) {
          // No row existed → create on first promotion.
          await prisma.loyaltyGrade.create({
            data: { clientId: booking.clientId, grade: suggestedGrade },
          });
        }
        const { invalidateLoyaltyCache } = await import('@/lib/loyalty-server');
        await invalidateLoyaltyCache(booking.clientId);
        await createLoyaltyUpdateNotification(booking.clientId, suggestedGrade, booking.client.language || 'fr');
      }
    } catch (err) {
      // Loyalty recompute failure should NEVER block the booking transition.
      // But we still log it so a silent grade-promotion miss has a trace.
      logger.error('booking-loyalty', 'recompute_failed', {
        clientId: booking.clientId,
        bookingId: booking.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Parrainage Royal — reward the sponsor (if any) on the referee's 1st
    // COMPLETED booking. Fail-soft : a glitch here never blocks the
    // status transition. Notifs to both parties are fired post-commit.
    try {
      const { rewardReferralIfApplicable } = await import('@/lib/referral');
      const { createReferralRewardedNotification } = await import('@/lib/notifications');
      const reward = await rewardReferralIfApplicable(booking.clientId);
      if (reward.rewarded && reward.sponsorId && reward.refereeId) {
        // Sponsor + referee both notified.  The notif helper is bilingual
        // and silently swallows failures (we don't want a notif glitch
        // to surface as a booking transition error).
        await Promise.allSettled([
          createReferralRewardedNotification(reward.sponsorId, 'sponsor'),
          createReferralRewardedNotification(reward.refereeId, 'referee'),
        ]);
      }
    } catch (err) {
      logger.error('booking-referral', 'reward_failed', {
        refereeId: booking.clientId,
        bookingId: booking.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
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

// Maps a TaxiTrip.tripType to the canonical terminal status used by the
// status machine in /api/admin/taxi-trips/[id]/status. Keep in sync with
// the FLOWS constant declared there — both encode the same business rule
// (OUTBOUND/STANDALONE land at the pension, RETURN lands at the client).
const TAXI_TRIP_TERMINAL_BY_TYPE: Record<string, string> = {
  OUTBOUND: 'ARRIVED_AT_PENSION',
  STANDALONE: 'ARRIVED_AT_PENSION',
  RETURN: 'ARRIVED_AT_CLIENT',
};

// Non-terminal statuses we cascade to a terminal one when the parent
// Booking is closed. PLANNED stays untouched: an unstarted return leg
// after the pension portion was completed simply never happened — we
// don't want to fabricate a delivery.
const TAXI_TRIP_ACTIVE_STATUSES = [
  'EN_ROUTE_TO_CLIENT',
  'ON_SITE_CLIENT',
  'ANIMAL_ON_BOARD',
];

/**
 * Mark every active TaxiTrip belonging to `bookingId` as terminal in one
 * transaction. Idempotent: trips already terminal (or PLANNED) are
 * untouched. Used by the COMPLETED-status cascade — see comment at the
 * call site for the root-cause discussion (Wave-1 bug #3).
 */
async function finalizeTaxiTripsForBooking(bookingId: string, actorId: string): Promise<void> {
  const trips = await prisma.taxiTrip.findMany({
    where: {
      bookingId,
      status: { in: TAXI_TRIP_ACTIVE_STATUSES },
    },
    select: { id: true, tripType: true },
  });
  if (trips.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const trip of trips) {
      const terminal = TAXI_TRIP_TERMINAL_BY_TYPE[trip.tripType] ?? 'ARRIVED_AT_PENSION';
      await tx.taxiTrip.update({
        where: { id: trip.id },
        data: {
          status: terminal,
          trackingActive: false,
          // Rotating the token mirrors the manual terminal path in
          // /api/admin/taxi-trips/[id]/status: any /track/[token] cached
          // by the client returns 404 from this point on.
          trackingToken: null,
        },
      });
      await tx.taxiStatusHistory.create({
        data: {
          taxiTripId: trip.id,
          status: terminal,
          updatedBy: actorId,
        },
      });
    }
  });
}
