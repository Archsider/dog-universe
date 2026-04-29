import { prisma } from './prisma';
import { sendEmail, getEmailTemplate } from './email';

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
  | 'BOOKING_EXTENDED'          // client receives when stay is extended (admin direct or approved)
  | 'BOOKING_NO_SHOW'           // client receives when booking is marked NO_SHOW by admin
  | 'BOOKING_WAITLISTED'        // client receives when booking is queued on the waitlist
  | 'BOOKING_WAITLIST_PROMOTED'; // client receives when waitlisted booking is promoted to PENDING

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
  return prisma.notification.create({
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
}

export async function createBookingConfirmationNotification(
  userId: string,
  bookingRef: string,
  petName: string
) {
  return createNotification({
    userId,
    type: 'BOOKING_CONFIRMATION',
    titleFr: 'Demande de réservation envoyée',
    titleEn: 'Booking request sent',
    messageFr: `Votre demande de réservation pour ${petName} (réf. ${bookingRef}) a bien été reçue. Notre équipe vous confirmera sous 24h.`,
    messageEn: `Your booking request for ${petName} (ref. ${bookingRef}) has been received. Our team will confirm within 24 hours.`,
  });
}

export async function createBookingValidationNotification(
  userId: string,
  bookingRef: string,
  petName: string,
  dates: string
) {
  return createNotification({
    userId,
    type: 'BOOKING_VALIDATION',
    titleFr: 'Réservation confirmée !',
    titleEn: 'Booking confirmed!',
    messageFr: `Votre réservation pour ${petName} (${dates}) a été confirmée. Réf. : ${bookingRef}`,
    messageEn: `Your booking for ${petName} (${dates}) has been confirmed. Ref: ${bookingRef}`,
  });
}

export async function createBookingRefusalNotification(
  userId: string,
  bookingRef: string,
  reason?: string
) {
  return createNotification({
    userId,
    type: 'BOOKING_REFUSAL',
    titleFr: 'Réservation non disponible',
    titleEn: 'Booking unavailable',
    messageFr: `Votre réservation (réf. ${bookingRef}) ne peut pas être honorée.${reason ? ` Motif : ${reason}` : ''}`,
    messageEn: `Your booking (ref. ${bookingRef}) cannot be accommodated.${reason ? ` Reason: ${reason}` : ''}`,
  });
}

export async function createBookingInProgressNotification(
  userId: string,
  bookingRef: string,
  petName: string,
  serviceType: 'BOARDING' | 'PET_TAXI'
) {
  const isTaxi = serviceType === 'PET_TAXI';
  return createNotification({
    userId,
    type: 'BOOKING_IN_PROGRESS',
    titleFr: isTaxi ? 'Animal à bord' : 'Séjour en cours',
    titleEn: isTaxi ? 'Pet on board' : 'Stay in progress',
    messageFr: isTaxi
      ? `${petName} est à bord et en route avec notre équipe (réf. ${bookingRef}).`
      : `${petName} est bien arrivé(e) dans nos locaux — le séjour a commencé (réf. ${bookingRef}).`,
    messageEn: isTaxi
      ? `${petName} is on board and on the way with our team (ref. ${bookingRef}).`
      : `${petName} has arrived safely at our facility — the stay has begun (ref. ${bookingRef}).`,
  });
}

export async function createBookingCompletedNotification(
  userId: string,
  bookingRef: string,
  petName: string,
  serviceType: 'BOARDING' | 'PET_TAXI',
  hasGrooming: boolean = false
) {
  const isTaxi = serviceType === 'PET_TAXI';

  let titleFr: string;
  let titleEn: string;
  let messageFr: string;
  let messageEn: string;

  if (isTaxi) {
    titleFr = 'Trajet terminé';
    titleEn = 'Trip completed';
    messageFr = `${petName} est arrivé(e) à destination (réf. ${bookingRef}).`;
    messageEn = `${petName} has arrived at the destination (ref. ${bookingRef}).`;
  } else if (hasGrooming) {
    titleFr = 'Séjour & toilettage terminés';
    titleEn = 'Stay & grooming completed';
    messageFr = `Le séjour et le toilettage de ${petName} sont terminés — votre compagnon est prêt à être récupéré (réf. ${bookingRef}).`;
    messageEn = `${petName}'s stay and grooming are complete — your companion is ready to be picked up (ref. ${bookingRef}).`;
  } else {
    titleFr = 'Séjour terminé';
    titleEn = 'Stay completed';
    messageFr = `Le séjour de ${petName} est terminé — votre compagnon est prêt à être récupéré (réf. ${bookingRef}).`;
    messageEn = `${petName}'s stay is complete — your companion is ready to be picked up (ref. ${bookingRef}).`;
  }

  const notification = await createNotification({
    userId,
    type: 'BOOKING_COMPLETED',
    titleFr,
    titleEn,
    messageFr,
    messageEn,
  });

  // Send email (non-blocking)
  try {
    const client = await prisma.user.findUnique({
      where: { id: userId },
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
  return createNotification({
    userId,
    type: 'INVOICE_AVAILABLE',
    titleFr: 'Nouvelle facture disponible',
    titleEn: 'New invoice available',
    messageFr: `Votre facture ${invoiceNumber} d'un montant de ${amount} est disponible.`,
    messageEn: `Your invoice ${invoiceNumber} for ${amount} is now available.`,
  });
}

export async function createInvoicePaidNotification(
  userId: string,
  invoiceNumber: string,
  amount: string
) {
  const notification = await createNotification({
    userId,
    type: 'INVOICE_PAID',
    titleFr: 'Paiement confirmé',
    titleEn: 'Payment confirmed',
    messageFr: `Votre facture ${invoiceNumber} d'un montant de ${amount} a bien été réglée. Merci !`,
    messageEn: `Your invoice ${invoiceNumber} for ${amount} has been paid. Thank you!`,
  });

  try {
    const client = await prisma.user.findUnique({
      where: { id: userId },
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

  const notification = await createNotification({
    userId,
    type: 'LOYALTY_UPDATE',
    titleFr: 'Grade de fidélité mis à jour',
    titleEn: 'Loyalty grade updated',
    messageFr: `Félicitations ! Votre grade de fidélité a été mis à jour : ${gradeLabels.fr[grade] ?? grade}.`,
    messageEn: `Congratulations! Your loyalty grade has been updated: ${gradeLabels.en[grade] ?? grade}.`,
  });

  // Send email notification (non-blocking)
  try {
    const client = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    if (client) {
      const gradeLabel = locale === 'fr' ? (gradeLabels.fr[grade] ?? grade) : (gradeLabels.en[grade] ?? grade);
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
  return createNotification({
    userId,
    type: 'STAY_PHOTO',
    titleFr: '📸 Nouvelles photos de séjour',
    titleEn: '📸 New stay photos',
    messageFr: `De nouvelles photos de ${petName} ont été publiées pour votre réservation (réf. ${bookingRef}).`,
    messageEn: `New photos of ${petName} have been posted for your booking (ref. ${bookingRef}).`,
    metadata: { bookingId },
  });
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

  const notification = await createNotification({
    userId,
    type: 'LOYALTY_UPDATE',
    titleFr: isApproved ? 'Avantage fidélité accordé' : 'Réclamation d\'avantage refusée',
    titleEn: isApproved ? 'Loyalty benefit granted' : 'Benefit claim rejected',
    messageFr: isApproved
      ? `Votre demande pour « ${benefitLabelFr} » a été acceptée. Notre équipe vous contactera pour la mise en place.`
      : `Votre demande pour « ${benefitLabelFr} » a été refusée.${rejectionReason ? ` Motif : ${rejectionReason}` : ''}`,
    messageEn: isApproved
      ? `Your request for "${benefitLabelEn}" has been approved. Our team will contact you shortly.`
      : `Your request for "${benefitLabelEn}" has been rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
  });

  // Send email (non-blocking)
  try {
    const client = await prisma.user.findUnique({
      where: { id: userId },
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
    where: { role: { in: ['ADMIN', 'SUPERADMIN'] } },
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
  return createAdminNotifications({
    type: 'BOOKING_REQUEST',
    titleFr: 'Nouvelle demande de réservation',
    titleEn: 'New booking request',
    messageFr: `${clientName} a soumis une demande de ${serviceTypeFr} pour ${petNames} — réf. ${bookingRef}`,
    messageEn: `${clientName} submitted a ${serviceTypeEn} request for ${petNames} — ref. ${bookingRef}`,
    metadata: { bookingId, bookingRef },
  });
}

export async function notifyAdminsNewClient(
  clientName: string,
  clientEmail: string,
  clientPhone: string | null,
  clientId: string
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.doguniverse.ma';
  const phonePart = clientPhone ? ` · ${clientPhone}` : '';
  await createAdminNotifications({
    type: 'NEW_CLIENT_REGISTRATION',
    titleFr: 'Nouveau client inscrit',
    titleEn: 'New client registered',
    messageFr: `${clientName} (${clientEmail}${phonePart}) vient de créer un compte.`,
    messageEn: `${clientName} (${clientEmail}${phonePart}) just created an account.`,
    metadata: { clientId, clientUrl: `${appUrl}/fr/admin/clients/${clientId}` },
  });

  // Send email to all admin emails (non-blocking)
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPERADMIN'] } },
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
  return createAdminNotifications({
    type: 'LOYALTY_CLAIM_PENDING',
    titleFr: 'Nouvelle réclamation d\'avantage fidélité',
    titleEn: 'New loyalty benefit claim',
    messageFr: `${clientName} demande : « ${benefitLabelFr} »`,
    messageEn: `${clientName} requests: "${benefitLabelEn}"`,
    metadata: { claimId },
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, read: false },
  });
}

// ─── Extension request notifications ─────────────────────────────────────────

// ─── Taxi heartbeat alerts ───────────────────────────────────────────────────

export async function notifyAdminsTaxiHeartbeatLost(args: {
  bookingId: string;
  bookingRef: string;
  clientName: string;
  petNames: string;
}) {
  return createAdminNotifications({
    type: 'TAXI_HEARTBEAT_LOST',
    titleFr: 'Taxi : signal GPS perdu',
    titleEn: 'Taxi: GPS signal lost',
    messageFr: `⚠️ Pas de signal GPS depuis 5 min — ${args.clientName} / ${args.petNames} / Réservation ${args.bookingRef}`,
    messageEn: `⚠️ No GPS signal for 5 min — ${args.clientName} / ${args.petNames} / Booking ${args.bookingRef}`,
    metadata: { bookingId: args.bookingId, bookingRef: args.bookingRef },
  });
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
  return createAdminNotifications({
    type: 'EXTENSION_REQUEST',
    titleFr: 'Demande de prolongation de séjour',
    titleEn: 'Stay extension request',
    messageFr: `${clientName} demande une prolongation pour ${petNames} (réf. ${bookingRef}) — nouvelle date de sortie souhaitée : ${requestedEndDate}`,
    messageEn: `${clientName} requests a stay extension for ${petNames} (ref. ${bookingRef}) — requested new checkout: ${requestedEndDate}`,
    metadata: { bookingId, bookingRef },
  });
}

export async function createBookingExtendedNotification(
  clientId: string,
  bookingRef: string,
  newEndDate: string,
  lang: string
) {
  return createNotification({
    userId: clientId,
    type: 'BOOKING_EXTENDED',
    titleFr: 'Séjour prolongé',
    titleEn: 'Stay extended',
    messageFr: `Votre séjour (réf. ${bookingRef}) a été prolongé. Nouvelle date de sortie : ${newEndDate}.`,
    messageEn: `Your stay (ref. ${bookingRef}) has been extended. New checkout date: ${newEndDate}.`,
    metadata: { bookingId: bookingRef, lang },
  });
}

export async function createExtensionRejectedNotification(
  clientId: string,
  bookingRef: string,
) {
  return createNotification({
    userId: clientId,
    type: 'BOOKING_REFUSAL',
    titleFr: 'Demande de prolongation refusée',
    titleEn: 'Extension request declined',
    messageFr: `Votre demande de prolongation pour la réservation ${bookingRef} n'a pas pu être acceptée. Contactez-nous pour plus d'informations.`,
    messageEn: `Your extension request for booking ${bookingRef} could not be approved. Please contact us for more details.`,
    metadata: { bookingRef },
  });
}

// Booking marked as NO_SHOW by admin — informational message to the client.
// NO_SHOW bookings do NOT count toward loyalty (totalStays filter is on
// status='COMPLETED'), so we don't need to deduct anything explicitly.
export async function createBookingNoShowNotification(
  clientId: string,
  bookingRef: string,
  petName: string,
) {
  return createNotification({
    userId: clientId,
    type: 'BOOKING_NO_SHOW',
    titleFr: 'Réservation marquée comme No Show',
    titleEn: 'Booking marked as No Show',
    messageFr: `Votre réservation pour ${petName} (réf. ${bookingRef}) a été marquée No Show suite à une absence non signalée. Contactez-nous pour toute question.`,
    messageEn: `Your booking for ${petName} (ref. ${bookingRef}) was marked No Show due to unreported absence. Please contact us if you have any questions.`,
    metadata: { bookingRef },
  });
}

// Client booked when boarding is full → automatically placed on the waitlist.
export async function createBookingWaitlistedNotification(
  clientId: string,
  bookingRef: string,
  petName: string,
) {
  return createNotification({
    userId: clientId,
    type: 'BOOKING_WAITLISTED',
    titleFr: "Inscription sur liste d'attente",
    titleEn: 'Added to waitlist',
    messageFr: `La pension est complète sur ces dates. ${petName} (réf. ${bookingRef}) est en liste d'attente — nous vous contactons dès qu'une place se libère.`,
    messageEn: `The boarding is full for these dates. ${petName} (ref. ${bookingRef}) is on the waitlist — we'll reach out as soon as a slot opens up.`,
    metadata: { bookingRef },
  });
}

// A slot opened up and this client's waitlisted booking has been promoted
// to PENDING — they need to wait for admin confirmation as usual.
export async function createWaitlistPromotedNotification(
  clientId: string,
  bookingRef: string,
  petName: string,
) {
  return createNotification({
    userId: clientId,
    type: 'BOOKING_WAITLIST_PROMOTED',
    titleFr: "Une place s'est libérée !",
    titleEn: 'A slot just opened up!',
    messageFr: `Bonne nouvelle : une place s'est libérée pour ${petName} (réf. ${bookingRef}). Votre réservation est maintenant en attente de confirmation.`,
    messageEn: `Good news: a slot is now available for ${petName} (ref. ${bookingRef}). Your booking is now pending confirmation.`,
    metadata: { bookingRef },
  });
}

// Promotes the oldest WAITLIST booking that overlaps the given window to
// PENDING and notifies its owner. Called whenever capacity is freed
// (CANCELLED, REJECTED, NO_SHOW). Returns the promoted booking id, or null
// if no waitlisted booking matched.
//
// Only the FIRST candidate is promoted — multiple WAITLIST entries on the
// same dates are processed FIFO (createdAt ASC). If after promotion the
// capacity is still partially full, subsequent transitions will pick up
// the next ones.
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
      deletedAt: null,
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
