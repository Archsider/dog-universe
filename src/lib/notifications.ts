import { prisma } from './prisma';

export type NotificationType =
  | 'BOOKING_CONFIRMATION'
  | 'BOOKING_VALIDATION'
  | 'BOOKING_REFUSAL'
  | 'STAY_REMINDER'
  | 'INVOICE_AVAILABLE'
  | 'ADMIN_MESSAGE'
  | 'LOYALTY_UPDATE';

interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  titleFr: string;
  titleEn: string;
  messageFr: string;
  messageEn: string;
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

  return createNotification({
    userId,
    type: 'LOYALTY_UPDATE',
    titleFr: 'Grade de fidélité mis à jour',
    titleEn: 'Loyalty grade updated',
    messageFr: `Félicitations ! Votre grade de fidélité a été mis à jour : ${gradeLabels.fr[grade] ?? grade}.`,
    messageEn: `Congratulations! Your loyalty grade has been updated: ${gradeLabels.en[grade] ?? grade}.`,
  });
}

export async function createAdminMessageNotification(
  userId: string,
  messageFr: string,
  messageEn: string
) {
  return createNotification({
    userId,
    type: 'ADMIN_MESSAGE',
    titleFr: 'Message de Dog Universe',
    titleEn: 'Message from Dog Universe',
    messageFr,
    messageEn,
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, read: false },
  });
}
