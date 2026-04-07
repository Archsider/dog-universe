import { prisma } from './prisma';
import { sendEmail, getEmailTemplate } from './email';

export type NotificationType =
  | 'BOOKING_CONFIRMATION'
  | 'BOOKING_VALIDATION'
  | 'BOOKING_REFUSAL'
  | 'BOOKING_IN_PROGRESS'
  | 'BOOKING_COMPLETED'
  | 'STAY_REMINDER'
  | 'INVOICE_AVAILABLE'
  | 'ADMIN_MESSAGE'
  | 'STAY_PHOTO'
  | 'LOYALTY_UPDATE'
  | 'PET_BIRTHDAY'
  | 'BOOKING_REQUEST'           // admin receives when a client creates a booking
  | 'LOYALTY_CLAIM_PENDING'     // admin receives when a client submits a claim
  | 'NEW_CLIENT_REGISTRATION';  // admin receives when a new client registers

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
