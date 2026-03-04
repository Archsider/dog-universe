import { prisma } from './prisma';

export type NotificationType =
  | 'BOOKING_CONFIRMATION'
  | 'BOOKING_VALIDATION'
  | 'BOOKING_REFUSAL'
  | 'STAY_REMINDER'
  | 'INVOICE_AVAILABLE'
  | 'ADMIN_MESSAGE'
  | 'STAY_PHOTO'
  | 'LOYALTY_UPDATE'
  | 'WELCOME'
  | 'NEW_CLIENT'
  | 'NEW_PET'
  | 'BENEFIT_CLAIM';

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
      metadata: data.metadata ?? undefined,
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

export async function createBookingInProgressNotification(
  userId: string,
  bookingRef: string,
  petName: string
) {
  return createNotification({
    userId,
    type: 'BOOKING_VALIDATION',
    titleFr: 'Séjour commencé',
    titleEn: 'Stay in progress',
    messageFr: `Le séjour de ${petName} a commencé. Réf. : ${bookingRef}`,
    messageEn: `${petName}'s stay has started. Ref: ${bookingRef}`,
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
    fr: { MEMBER: 'Member', BRONZE: 'Member', SILVER: 'Silver', GOLD: 'Gold', PLATINUM: 'Platine' },
    en: { MEMBER: 'Member', BRONZE: 'Member', SILVER: 'Silver', GOLD: 'Gold', PLATINUM: 'Platinum' },
  };

  return createNotification({
    userId,
    type: 'LOYALTY_UPDATE',
    titleFr: 'Grade de fidélité mis à jour',
    titleEn: 'Loyalty grade updated',
    messageFr: `Félicitations ! Votre grade de fidélité a été mis à jour : ${gradeLabels.fr[grade] ?? grade}.`,
    messageEn: `Congratulations! Your loyalty grade has been updated: ${gradeLabels.en[grade] ?? grade}.`,
  });
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

export async function createWelcomeNotification(userId: string, clientName: string) {
  return createNotification({
    userId,
    type: 'WELCOME',
    titleFr: 'Bienvenue chez Dog Universe !',
    titleEn: 'Welcome to Dog Universe!',
    messageFr: `Bonjour ${clientName}, votre compte a bien été créé. Vous pouvez dès maintenant réserver nos services pour votre compagnon.`,
    messageEn: `Hello ${clientName}, your account has been created. You can now book our services for your companion.`,
  });
}

export async function createAdminNewClientNotification(adminId: string, clientId: string, clientName: string, clientEmail: string) {
  return createNotification({
    userId: adminId,
    type: 'NEW_CLIENT',
    titleFr: '👤 Nouveau client inscrit',
    titleEn: '👤 New client registered',
    messageFr: `${clientName} (${clientEmail}) vient de créer un compte.`,
    messageEn: `${clientName} (${clientEmail}) just created an account.`,
    metadata: { clientId },
  });
}

export async function createAdminNewPetNotification(
  adminId: string,
  clientName: string,
  petName: string,
  species: string,
  petId: string,
  clientId: string
) {
  const speciesLabelFr = species === 'DOG' ? 'chien' : 'chat';
  const speciesLabelEn = species === 'DOG' ? 'dog' : 'cat';
  return createNotification({
    userId: adminId,
    type: 'NEW_PET',
    titleFr: '🐾 Nouvel animal ajouté',
    titleEn: '🐾 New pet added',
    messageFr: `${clientName} a ajouté un ${speciesLabelFr} : ${petName}.`,
    messageEn: `${clientName} added a ${speciesLabelEn}: ${petName}.`,
    metadata: { petId, clientId },
  });
}

export async function createStayReminderNotification(
  userId: string,
  petName: string,
  startDate: string,
  bookingId: string
) {
  return createNotification({
    userId,
    type: 'STAY_REMINDER',
    titleFr: '🐾 Rappel de séjour',
    titleEn: '🐾 Stay reminder',
    messageFr: `Le séjour de ${petName} commence dans 2 jours (${startDate}). Pensez à préparer ses affaires !`,
    messageEn: `${petName}'s stay starts in 2 days (${startDate}). Don't forget to pack their belongings!`,
    metadata: { bookingId },
  });
}

const BENEFIT_LABELS: Record<string, { fr: string; en: string }> = {
  VET_CHECKUP:       { fr: 'check-up vétérinaire offert',         en: 'complimentary vet check-up' },
  PET_TRANSPORT:     { fr: 'transport animalier offert',           en: 'complimentary pet transport' },
  BIRTHDAY_SURPRISE: { fr: 'surprise anniversaire pour votre animal', en: 'birthday surprise for your pet' },
};

export async function createBenefitClaimSubmittedNotification(
  adminId: string,
  clientName: string,
  benefitKey: string,
  claimId: string
) {
  const label = BENEFIT_LABELS[benefitKey];
  return createNotification({
    userId: adminId,
    type: 'BENEFIT_CLAIM',
    titleFr: '🎁 Demande d\'avantage fidélité',
    titleEn: '🎁 Loyalty benefit request',
    messageFr: `${clientName} demande à utiliser son avantage : ${label?.fr ?? benefitKey}.`,
    messageEn: `${clientName} requested to use their benefit: ${label?.en ?? benefitKey}.`,
    metadata: { claimId },
  });
}

export async function createBenefitClaimApprovedNotification(clientId: string, benefitKey: string) {
  const label = BENEFIT_LABELS[benefitKey];
  return createNotification({
    userId: clientId,
    type: 'BENEFIT_CLAIM',
    titleFr: '✅ Avantage approuvé !',
    titleEn: '✅ Benefit approved!',
    messageFr: `Votre demande de ${label?.fr ?? benefitKey} a été approuvée. Notre équipe vous contactera.`,
    messageEn: `Your request for a ${label?.en ?? benefitKey} has been approved. Our team will contact you.`,
    metadata: { benefitKey },
  });
}

export async function createBenefitClaimRejectedNotification(
  clientId: string,
  benefitKey: string,
  adminNote?: string
) {
  const label = BENEFIT_LABELS[benefitKey];
  return createNotification({
    userId: clientId,
    type: 'BENEFIT_CLAIM',
    titleFr: 'Demande d\'avantage refusée',
    titleEn: 'Benefit request declined',
    messageFr: `Votre demande de ${label?.fr ?? benefitKey} n'a pas pu être accordée.${adminNote ? ` Note : ${adminNote}` : ''}`,
    messageEn: `Your request for a ${label?.en ?? benefitKey} could not be granted.${adminNote ? ` Note: ${adminNote}` : ''}`,
    metadata: { benefitKey },
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, read: false },
  });
}
