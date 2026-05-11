import { prisma } from '@/lib/prisma';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { NOTIFICATION_MESSAGES } from '@/lib/notification-messages';
import { createNotification, createAdminNotifications } from './core';

export async function createBookingConfirmationNotification(
  userId: string,
  bookingRef: string,
  petName: string
) {
  const msg = NOTIFICATION_MESSAGES.BOOKING_CONFIRMATION({ petName, bookingRef });
  return createNotification({ userId, type: 'BOOKING_CONFIRMATION', ...msg });
}

export async function createBookingValidationNotification(
  userId: string,
  bookingRef: string,
  petName: string,
  dates: string
) {
  const msg = NOTIFICATION_MESSAGES.BOOKING_VALIDATION({ petName, bookingRef, dates });
  return createNotification({ userId, type: 'BOOKING_VALIDATION', ...msg });
}

export async function createBookingRefusalNotification(
  userId: string,
  bookingRef: string,
  reason?: string
) {
  const msg = NOTIFICATION_MESSAGES.BOOKING_REFUSAL({ bookingRef, reason: reason ?? '' });
  return createNotification({ userId, type: 'BOOKING_REFUSAL', ...msg });
}

export async function createBookingInProgressNotification(
  userId: string,
  bookingRef: string,
  petName: string,
  serviceType: 'BOARDING' | 'PET_TAXI'
) {
  const isTaxi = serviceType === 'PET_TAXI';
  const key = isTaxi ? 'BOOKING_IN_PROGRESS_TAXI' : 'BOOKING_IN_PROGRESS_BOARDING';
  const msg = NOTIFICATION_MESSAGES[key]({ petName, bookingRef });
  return createNotification({ userId, type: 'BOOKING_IN_PROGRESS', ...msg });
}

export async function createBookingCompletedNotification(
  userId: string,
  bookingRef: string,
  petName: string,
  serviceType: 'BOARDING' | 'PET_TAXI',
  hasGrooming: boolean = false
) {
  const isTaxi = serviceType === 'PET_TAXI';
  let key: string;
  if (isTaxi) {
    key = 'BOOKING_COMPLETED_TAXI';
  } else if (hasGrooming) {
    key = 'BOOKING_COMPLETED_WITH_GROOMING';
  } else {
    key = 'BOOKING_COMPLETED_BOARDING';
  }
  const msg = NOTIFICATION_MESSAGES[key]({ petName, bookingRef });

  const notification = await createNotification({ userId, type: 'BOOKING_COMPLETED', ...msg });

  // Send email (non-blocking)
  try {
    const client = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
      select: { name: true, email: true, language: true },
    });
    if (client) {
      const locale = client.language ?? 'fr';
      const { subject, html } = getEmailTemplate(
        'booking_completed',
        {
          clientName: client.name ?? client.email,
          bookingRef,
          petName,
          serviceType,
          hasGrooming: hasGrooming ? 'true' : 'false',
        },
        locale
      );
      await sendEmail({ to: client.email, subject, html });
    }
  } catch { /* non-blocking */ }

  return notification;
}

export async function notifyAdminsNewBooking(
  clientName: string,
  petNames: string,
  serviceTypeFr: string,
  serviceTypeEn: string,
  bookingRef: string,
  bookingId: string
) {
  const msg = NOTIFICATION_MESSAGES.BOOKING_REQUEST({ clientName, serviceTypeFr, serviceTypeEn, petNames, bookingRef });
  return createAdminNotifications({ type: 'BOOKING_REQUEST', ...msg, metadata: { bookingId, bookingRef } });
}

export async function notifyAdminsExtensionRequest(
  bookingRef: string,
  clientName: string,
  petNames: string,
  requestedEndDate: string,
  bookingId: string
) {
  const msg = NOTIFICATION_MESSAGES.EXTENSION_REQUEST({ bookingRef, clientName, petNames, requestedEndDate });
  return createAdminNotifications({ type: 'EXTENSION_REQUEST', ...msg, metadata: { bookingId, bookingRef } });
}

export async function createBookingExtendedNotification(
  clientId: string,
  bookingRef: string,
  newEndDate: string,
  lang: string
) {
  const msg = NOTIFICATION_MESSAGES.BOOKING_EXTENDED({ bookingRef, newEndDate });
  return createNotification({
    userId: clientId,
    type: 'BOOKING_EXTENDED',
    ...msg,
    metadata: { bookingId: bookingRef, lang },
  });
}

export async function createExtensionRejectedNotification(
  clientId: string,
  bookingRef: string,
) {
  const msg = NOTIFICATION_MESSAGES.BOOKING_EXTENSION_REJECTED({ bookingRef });
  return createNotification({ userId: clientId, type: 'BOOKING_REFUSAL', ...msg, metadata: { bookingRef } });
}

// Booking marked as NO_SHOW by admin — informational message to the client.
export async function createBookingNoShowNotification(
  clientId: string,
  bookingRef: string,
  petName: string,
) {
  const msg = NOTIFICATION_MESSAGES.BOOKING_NO_SHOW({ petName, bookingRef });
  return createNotification({ userId: clientId, type: 'BOOKING_NO_SHOW', ...msg, metadata: { bookingRef } });
}

// Client booked when boarding is full → automatically placed on the waitlist.
export async function createBookingWaitlistedNotification(
  clientId: string,
  bookingRef: string,
  petName: string,
) {
  const msg = NOTIFICATION_MESSAGES.BOOKING_WAITLISTED({ petName, bookingRef });
  return createNotification({ userId: clientId, type: 'BOOKING_WAITLISTED', ...msg, metadata: { bookingRef } });
}

// A slot opened up and this client's waitlisted booking has been promoted
// to PENDING — they need to wait for admin confirmation as usual.
export async function createWaitlistPromotedNotification(
  clientId: string,
  bookingRef: string,
  petName: string,
) {
  const msg = NOTIFICATION_MESSAGES.BOOKING_WAITLIST_PROMOTED({ petName, bookingRef });
  return createNotification({ userId: clientId, type: 'BOOKING_WAITLIST_PROMOTED', ...msg, metadata: { bookingRef } });
}

// Promotes the oldest WAITLIST booking that overlaps the given window to
// PENDING and notifies its owner. Called whenever capacity is freed
// (CANCELLED, REJECTED, NO_SHOW). Returns the promoted booking id, or null
// if no waitlisted booking matched.
//
// SAFETY: each candidate is re-checked against the LIVE capacity inside a
// Serializable transaction before being moved out of WAITLIST. Without this
// guard, freeing one slot could promote a candidate whose pets exceed the
// remaining capacity (e.g. cancellation of a 1-dog booking does not entitle
// us to promote a 3-dog WAITLIST). On capacity-fail we move on to the next
// candidate (FIFO) and try again, up to MAX_CANDIDATES.
const MAX_WAITLIST_CANDIDATES = 10;

export async function promoteWaitlistedBooking(args: {
  startDate: Date;
  endDate: Date | null;
}): Promise<string | null> {
  if (!args.endDate) return null;

  const { prisma: db } = await import('@/lib/prisma');
  const { Prisma } = await import('@prisma/client');
  const { checkBoardingCapacity } = await import('@/lib/capacity');

  const candidates = await db.booking.findMany({
    where: {
      status: 'WAITLIST',
      serviceType: 'BOARDING',
      deletedAt: null,
      startDate: { lte: args.endDate },
      endDate: { gte: args.startDate, not: null },
    },
    orderBy: { createdAt: 'asc' },
    take: MAX_WAITLIST_CANDIDATES,
    include: {
      bookingPets: { include: { pet: { select: { name: true } } } },
    },
  });

  for (const candidate of candidates) {
    if (!candidate.endDate) continue;
    let promoted = false;
    try {
      await db.$transaction(
        async (tx) => {
          const fresh = await tx.booking.findFirst({
            where: { id: candidate.id, status: 'WAITLIST', deletedAt: null },
            select: {
              id: true,
              startDate: true,
              endDate: true,
              bookingPets: { select: { petId: true } },
            },
          });
          if (!fresh || !fresh.endDate) return;

          const cap = await checkBoardingCapacity(
            {
              petIds: fresh.bookingPets.map((bp) => bp.petId),
              startDate: fresh.startDate,
              endDate: fresh.endDate,
              excludeBookingId: candidate.id,
            },
            tx,
          );
          if (!cap.ok) return; // leave on WAITLIST — we'll try next candidate

          await tx.booking.update({
            where: { id: candidate.id },
            data: { status: 'PENDING' },
          });
          promoted = true;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 },
      );
    } catch {
      // P2034 / timeouts are non-fatal here — leave on WAITLIST and continue.
      promoted = false;
    }

    if (promoted) {
      const petNames = candidate.bookingPets.map((bp) => bp.pet.name).join(', ') || 'votre animal';
      const bookingRef = candidate.id.slice(0, 8).toUpperCase();
      await createWaitlistPromotedNotification(candidate.clientId, bookingRef, petNames);
      return candidate.id;
    }
  }

  return null;
}

const ADDON_LABELS: Record<string, { fr: string; en: string }> = {
  PET_TAXI:   { fr: 'Pet Taxi',    en: 'Pet Taxi' },
  TOILETTAGE: { fr: 'Toilettage',  en: 'Grooming' },
  AUTRE:      { fr: 'Autre',       en: 'Other' },
};

export async function notifyAdminsAddonRequest(args: {
  bookingId: string;
  bookingRef: string;
  clientName: string;
  petNames: string;
  serviceType: 'PET_TAXI' | 'TOILETTAGE' | 'AUTRE';
  message: string;
  requestId: string;
}) {
  const labels = ADDON_LABELS[args.serviceType];
  const messageSuffixFr = args.message ? ` — « ${args.message} »` : '';
  const messageSuffixEn = args.message ? ` — "${args.message}"` : '';
  const messageSuffixAr = args.message ? ` — «${args.message}»` : '';
  return createAdminNotifications({
    type: 'ADDON_REQUEST',
    titleFr: `Demande d'addon — ${labels.fr}`,
    titleEn: `Addon request — ${labels.en}`,
    titleAr: `طلب خدمة إضافية — ${labels.en}`,
    messageFr: `${args.clientName} demande ${labels.fr} pour ${args.petNames} (réf. ${args.bookingRef})${messageSuffixFr}`,
    messageEn: `${args.clientName} requests ${labels.en} for ${args.petNames} (ref. ${args.bookingRef})${messageSuffixEn}`,
    messageAr: `${args.clientName} يطلب ${labels.en} من أجل ${args.petNames} (المرجع ${args.bookingRef})${messageSuffixAr}`,
    metadata: {
      bookingId: args.bookingId,
      bookingRef: args.bookingRef,
      requestId: args.requestId,
      serviceType: args.serviceType,
      message: args.message,
    },
  });
}

export async function notifyAdminsProductOrder(args: {
  clientName: string;
  productName: string;
  quantity: number;
  petNames: string;
  bookingId: string;
}) {
  const msg = NOTIFICATION_MESSAGES.PRODUCT_ORDER({
    clientName: args.clientName,
    productName: args.productName,
    quantity: String(args.quantity),
    petNames: args.petNames,
  });
  return createAdminNotifications({ type: 'PRODUCT_ORDER', ...msg, metadata: { bookingId: args.bookingId } });
}
