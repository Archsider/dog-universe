import { prisma } from './prisma';
import { sendEmail, getEmailTemplate } from './email';
import { cacheReadThrough, cacheDel, CacheKeys, CacheTTL } from './cache';
import { NOTIFICATION_MESSAGES } from './notification-messages';

export type NotificationType =
  | 'BOOKING_CONFIRMATION'
  | 'BOOKING_VALIDATION'
  | 'BOOKING_REFUSAL'
  | 'BOOKING_IN_PROGRESS'
  | 'BOOKING_COMPLETED'
  | 'STAY_REMINDER'
  | 'STAY_END_REMINDER'         // client receives J-1 before boarding end
  | 'INVOICE_AVAILABLE'
  | 'INVOICE_PAID'              // client receives when invoice is marked paid
  | 'ADMIN_MESSAGE'
  | 'STAY_PHOTO'
  | 'LOYALTY_UPDATE'
  | 'PET_BIRTHDAY'
  | 'BOOKING_REQUEST'           // admin receives when a client creates a booking
  | 'LOYALTY_CLAIM_PENDING'     // admin receives when a client submits a claim
  | 'NEW_CLIENT_REGISTRATION'   // admin receives when a new client registers
  | 'EXTENSION_REQUEST'         // admin receives when a client requests a stay extension
  | 'ADDON_REQUEST'             // admin receives when a client requests an additional service on a booking
  | 'TAXI_HEARTBEAT_LOST'       // admin receives when no GPS heartbeat for >5 min on an active taxi trip
  | 'TAXI_NEAR_PICKUP'          // client receives when driver is within ~1 km of pickup location
  | 'TAXI_ARRIVED'              // client receives when driver is within ~100 m of pickup location
  | 'BOOKING_EXTENDED'          // client receives when stay is extended (admin direct or approved)
  | 'BOOKING_NO_SHOW'           // client receives when booking is marked NO_SHOW by admin
  | 'BOOKING_WAITLISTED'        // client receives when booking is queued on the waitlist
  | 'BOOKING_WAITLIST_PROMOTED' // client receives when waitlisted booking is promoted to PENDING
  | 'BOOKING_CANCELLED'         // admin receives when a client cancels a booking
  | 'BOOKING_RESCHEDULE_REQUEST' // admin receives when a client requests new dates
  | 'STAY_PHOTO_ADDED'           // client receives when new stay photos are uploaded (Instagram-like feed)
  | 'WEEKLY_PET_REPORT'         // client receives weekly AI-generated stay report during IN_PROGRESS boarding
  | 'INVOICE_OVERDUE';          // client receives when an invoice is unpaid at J+30 then J+60

interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  titleFr: string;
  titleEn: string;
  messageFr: string;
  messageEn: string;
  metadata?: Record<string, string>;
}

export async function createNotification(data: CreateNotificationData) {
  const created = await prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      titleFr: data.titleFr,
      titleEn: data.titleEn,
      messageFr: data.messageFr,
      messageEn: data.messageEn,
      metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
      read: false,
    },
  });
  // Invalidate the cached unread count so the recipient's bell badge
  // reflects the new notification within their next request.
  await invalidateNotifCount(data.userId);
  return created;
}

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

export async function createInvoiceNotification(
  userId: string,
  invoiceNumber: string,
  amount: string
) {
  const msg = NOTIFICATION_MESSAGES.INVOICE_AVAILABLE({ invoiceNumber, amount });
  return createNotification({ userId, type: 'INVOICE_AVAILABLE', ...msg });
}

export async function createInvoicePaidNotification(
  userId: string,
  invoiceNumber: string,
  amount: string
) {
  const msg = NOTIFICATION_MESSAGES.INVOICE_PAID({ invoiceNumber, amount });
  const notification = await createNotification({ userId, type: 'INVOICE_PAID', ...msg });

  try {
    const client = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
      select: { name: true, email: true, language: true },
    });
    if (client) {
      const locale = client.language ?? 'fr';
      const { subject, html } = getEmailTemplate('invoice_paid', {
        clientName: client.name ?? client.email,
        invoiceNumber,
        amount,
      }, locale);
      await sendEmail({ to: client.email, subject, html });
    }
  } catch { /* non-blocking */ }

  return notification;
}

export async function createLoyaltyUpdateNotification(
  userId: string,
  grade: string,
  locale: string = 'fr'
) {
  const gradeLabels: Record<string, Record<string, string>> = {
    fr: { BRONZE: 'Bronze', SILVER: 'Argent', GOLD: 'Or', PLATINUM: 'Platine' },
    en: { BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold', PLATINUM: 'Platinum' },
  };
  const gradeFr = gradeLabels.fr[grade] ?? grade;
  const gradeEn = gradeLabels.en[grade] ?? grade;
  const msg = NOTIFICATION_MESSAGES.LOYALTY_UPDATE({ gradeFr, gradeEn });
  const notification = await createNotification({ userId, type: 'LOYALTY_UPDATE', ...msg });

  // Send email notification (non-blocking)
  try {
    const client = await prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { name: true, email: true } }); // soft-delete: required — no global extension (Edge Runtime incompatible)
    if (client) {
      const gradeLabel = locale === 'fr' ? gradeFr : gradeEn;
      const { subject, html } = getEmailTemplate('loyalty_update', { clientName: client.name, grade: gradeLabel }, locale);
      await sendEmail({ to: client.email, subject, html });
    }
  } catch { /* non-blocking */ }

  return notification;
}

export async function createStayPhotoNotification(
  userId: string,
  petName: string,
  bookingRef: string,
  bookingId: string
) {
  const msg = NOTIFICATION_MESSAGES.STAY_PHOTO({ petName, bookingRef });
  return createNotification({ userId, type: 'STAY_PHOTO', ...msg, metadata: { bookingId } });
}

export async function createStayPhotoAddedNotification(
  clientId: string,
  bookingId: string,
  petNames: string[],
) {
  const names = petNames.length > 0 ? petNames.join(', ') : 'votre animal';
  const namesEn = petNames.length > 0 ? petNames.join(', ') : 'your pet';
  const msg = NOTIFICATION_MESSAGES.STAY_PHOTO_ADDED({ names, namesEn });
  return createNotification({ userId: clientId, type: 'STAY_PHOTO_ADDED', ...msg, metadata: { bookingId } });
}

export async function createAdminMessageNotification(
  userId: string,
  messageFr: string,
  messageEn: string,
  bookingId?: string
) {
  return createNotification({
    userId,
    type: 'ADMIN_MESSAGE',
    titleFr: 'Message de Dog Universe',
    titleEn: 'Message from Dog Universe',
    messageFr,
    messageEn,
    metadata: bookingId ? { bookingId } : undefined,
  });
}

export async function createLoyaltyClaimResultNotification(
  userId: string,
  benefitLabelFr: string,
  benefitLabelEn: string,
  status: 'APPROVED' | 'REJECTED',
  rejectionReason?: string | null
) {
  const isApproved = status === 'APPROVED';
  const key = isApproved ? 'LOYALTY_CLAIM_APPROVED' : 'LOYALTY_CLAIM_REJECTED';
  const msg = NOTIFICATION_MESSAGES[key]({
    benefitFr: benefitLabelFr,
    benefitEn: benefitLabelEn,
    reason: rejectionReason ?? '',
  });

  const notification = await createNotification({ userId, type: 'LOYALTY_UPDATE', ...msg });

  // Send email (non-blocking)
  try {
    const client = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
      select: { name: true, email: true, language: true },
    });
    if (client) {
      const locale = client.language ?? 'fr';
      const templateType = isApproved ? 'loyalty_claim_approved' : 'loyalty_claim_rejected';
      const { subject, html } = getEmailTemplate(
        templateType,
        {
          clientName: client.name ?? client.email,
          benefitFr: benefitLabelFr,
          benefitEn: benefitLabelEn,
          reason: rejectionReason ?? '',
        },
        locale
      );
      await sendEmail({ to: client.email, subject, html });
    }
  } catch { /* non-blocking */ }

  return notification;
}

// ─── Admin notification helpers ───────────────────────────────────────────────

async function createAdminNotifications(data: Omit<CreateNotificationData, 'userId'>) {
  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPERADMIN'] }, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
    select: { id: true },
  });
  return Promise.all(admins.map((admin) => createNotification({ ...data, userId: admin.id })));
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

export async function notifyAdminsNewClient(
  clientName: string,
  clientEmail: string,
  clientPhone: string | null,
  clientId: string
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.doguniverse.ma';
  const phonePart = clientPhone ? ` · ${clientPhone}` : '';
  const msg = NOTIFICATION_MESSAGES.NEW_CLIENT_REGISTRATION({ clientName, clientEmail, phonePart });
  await createAdminNotifications({
    type: 'NEW_CLIENT_REGISTRATION',
    ...msg,
    metadata: { clientId, clientUrl: `${appUrl}/fr/admin/clients/${clientId}` },
  });

  // Send email to all admin emails (non-blocking)
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPERADMIN'] }, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
      select: { email: true, language: true },
    });
    const { getEmailTemplate } = await import('./email');
    await Promise.all(admins.map(async (admin) => {
      const locale = admin.language ?? 'fr';
      const clientUrl = `${appUrl}/${locale}/admin/clients/${clientId}`;
      const { subject, html } = getEmailTemplate(
        'admin_new_client',
        { clientName, clientEmail, clientPhone: clientPhone ?? '', clientUrl, registeredAt: new Date().toISOString() },
        locale
      );
      await sendEmail({ to: admin.email, subject, html });
    }));
  } catch { /* non-blocking */ }
}

export async function notifyAdminsNewLoyaltyClaim(
  clientName: string,
  benefitLabelFr: string,
  benefitLabelEn: string,
  claimId: string
) {
  const msg = NOTIFICATION_MESSAGES.LOYALTY_CLAIM_PENDING({ clientName, benefitFr: benefitLabelFr, benefitEn: benefitLabelEn });
  return createAdminNotifications({ type: 'LOYALTY_CLAIM_PENDING', ...msg, metadata: { claimId } });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return cacheReadThrough<number>(
    CacheKeys.notifCount(userId),
    CacheTTL.notifCount,
    () => prisma.notification.count({ where: { userId, read: false } }),
  );
}

/** Invalidate the cached unread-count for a user. Call after creating a
 *  notification for them or after they mark one as read. */
export async function invalidateNotifCount(userId: string): Promise<void> {
  await cacheDel(CacheKeys.notifCount(userId));
}

// ─── Taxi heartbeat alerts ───────────────────────────────────────────────────

export async function notifyAdminsTaxiHeartbeatLost(args: {
  bookingId: string;
  bookingRef: string;
  clientName: string;
  petNames: string;
}) {
  const msg = NOTIFICATION_MESSAGES.TAXI_HEARTBEAT_LOST({
    clientName: args.clientName,
    petNames: args.petNames,
    bookingRef: args.bookingRef,
  });
  return createAdminNotifications({
    type: 'TAXI_HEARTBEAT_LOST',
    ...msg,
    metadata: { bookingId: args.bookingId, bookingRef: args.bookingRef },
  });
}

// ─── Taxi geofencing notifications ───────────────────────────────────────────

export async function createTaxiNearPickupNotification(
  userId: string,
  bookingId: string,
  distance: number,
  _lang: string,
) {
  const msg = NOTIFICATION_MESSAGES.TAXI_NEAR_PICKUP({});
  return createNotification({
    userId,
    type: 'TAXI_NEAR_PICKUP',
    ...msg,
    metadata: { bookingId, distance: String(Math.round(distance)) },
  });
}

export async function createTaxiArrivedNotification(
  userId: string,
  bookingId: string,
  _lang: string,
) {
  const msg = NOTIFICATION_MESSAGES.TAXI_ARRIVED({});
  return createNotification({ userId, type: 'TAXI_ARRIVED', ...msg, metadata: { bookingId } });
}

// ─── Addon request notifications ─────────────────────────────────────────────

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
  return createAdminNotifications({
    type: 'ADDON_REQUEST',
    titleFr: `Demande d'addon — ${labels.fr}`,
    titleEn: `Addon request — ${labels.en}`,
    messageFr: `${args.clientName} demande ${labels.fr} pour ${args.petNames} (réf. ${args.bookingRef})${messageSuffixFr}`,
    messageEn: `${args.clientName} requests ${labels.en} for ${args.petNames} (ref. ${args.bookingRef})${messageSuffixEn}`,
    metadata: {
      bookingId: args.bookingId,
      bookingRef: args.bookingRef,
      requestId: args.requestId,
      serviceType: args.serviceType,
      message: args.message,
    },
  });
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
export async function promoteWaitlistedBooking(args: {
  startDate: Date;
  endDate: Date | null;
}): Promise<string | null> {
  if (!args.endDate) return null;

  const { prisma } = await import('@/lib/prisma');
  const candidate = await prisma.booking.findFirst({
    where: {
      status: 'WAITLIST',
      serviceType: 'BOARDING',
      deletedAt: null, // soft-delete: required — no global extension (Edge Runtime incompatible)
      startDate: { lte: args.endDate },
      endDate: { gte: args.startDate, not: null },
    },
    orderBy: { createdAt: 'asc' },
    include: {
      bookingPets: { include: { pet: { select: { name: true } } } },
    },
  });

  if (!candidate) return null;

  await prisma.booking.update({
    where: { id: candidate.id },
    data: { status: 'PENDING' },
  });

  const petNames = candidate.bookingPets.map((bp) => bp.pet.name).join(', ') || 'votre animal';
  const bookingRef = candidate.id.slice(0, 8).toUpperCase();
  await createWaitlistPromotedNotification(candidate.clientId, bookingRef, petNames);

  return candidate.id;
}
