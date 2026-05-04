/**
 * Centralized localized notification messages.
 *
 * Neutral file (no 'use client' directive) — can be imported by both Server
 * Components and Client Components without triggering Next.js 15 client-ref
 * wrapping issues.
 *
 * Each entry is a function that receives a data record and returns the four
 * localized string fields expected by `createNotification`.
 */

export type LocalizedMessage = {
  titleFr: string;
  titleEn: string;
  messageFr: string;
  messageEn: string;
};

type MessageFactory = (data: Record<string, string>) => LocalizedMessage;

export const NOTIFICATION_MESSAGES: Record<string, MessageFactory> = {
  // ── Client booking lifecycle ────────────────────────────────────────────────

  BOOKING_CONFIRMATION: ({ petName, bookingRef }) => ({
    titleFr: 'Demande de réservation envoyée',
    titleEn: 'Booking request sent',
    messageFr: `Votre demande de réservation pour ${petName} (réf. ${bookingRef}) a bien été reçue. Notre équipe vous confirmera sous 24h.`,
    messageEn: `Your booking request for ${petName} (ref. ${bookingRef}) has been received. Our team will confirm within 24 hours.`,
  }),

  BOOKING_VALIDATION: ({ petName, bookingRef, dates }) => ({
    titleFr: 'Réservation confirmée !',
    titleEn: 'Booking confirmed!',
    messageFr: `Votre réservation pour ${petName} (${dates}) a été confirmée. Réf. : ${bookingRef}`,
    messageEn: `Your booking for ${petName} (${dates}) has been confirmed. Ref: ${bookingRef}`,
  }),

  BOOKING_REFUSAL: ({ bookingRef, reason }) => ({
    titleFr: 'Réservation non disponible',
    titleEn: 'Booking unavailable',
    messageFr: `Votre réservation (réf. ${bookingRef}) ne peut pas être honorée.${reason ? ` Motif : ${reason}` : ''}`,
    messageEn: `Your booking (ref. ${bookingRef}) cannot be accommodated.${reason ? ` Reason: ${reason}` : ''}`,
  }),

  BOOKING_IN_PROGRESS_BOARDING: ({ petName, bookingRef }) => ({
    titleFr: 'Séjour en cours',
    titleEn: 'Stay in progress',
    messageFr: `${petName} est bien arrivé(e) dans nos locaux — le séjour a commencé (réf. ${bookingRef}).`,
    messageEn: `${petName} has arrived safely at our facility — the stay has begun (ref. ${bookingRef}).`,
  }),

  BOOKING_IN_PROGRESS_TAXI: ({ petName, bookingRef }) => ({
    titleFr: 'Animal à bord',
    titleEn: 'Pet on board',
    messageFr: `${petName} est à bord et en route avec notre équipe (réf. ${bookingRef}).`,
    messageEn: `${petName} is on board and on the way with our team (ref. ${bookingRef}).`,
  }),

  BOOKING_COMPLETED_TAXI: ({ petName, bookingRef }) => ({
    titleFr: 'Trajet terminé',
    titleEn: 'Trip completed',
    messageFr: `${petName} est arrivé(e) à destination (réf. ${bookingRef}).`,
    messageEn: `${petName} has arrived at the destination (ref. ${bookingRef}).`,
  }),

  BOOKING_COMPLETED_WITH_GROOMING: ({ petName, bookingRef }) => ({
    titleFr: 'Séjour & toilettage terminés',
    titleEn: 'Stay & grooming completed',
    messageFr: `Le séjour et le toilettage de ${petName} sont terminés — votre compagnon est prêt à être récupéré (réf. ${bookingRef}).`,
    messageEn: `${petName}'s stay and grooming are complete — your companion is ready to be picked up (ref. ${bookingRef}).`,
  }),

  BOOKING_COMPLETED_BOARDING: ({ petName, bookingRef }) => ({
    titleFr: 'Séjour terminé',
    titleEn: 'Stay completed',
    messageFr: `Le séjour de ${petName} est terminé — votre compagnon est prêt à être récupéré (réf. ${bookingRef}).`,
    messageEn: `${petName}'s stay is complete — your companion is ready to be picked up (ref. ${bookingRef}).`,
  }),

  BOOKING_EXTENDED: ({ bookingRef, newEndDate }) => ({
    titleFr: 'Séjour prolongé',
    titleEn: 'Stay extended',
    messageFr: `Votre séjour (réf. ${bookingRef}) a été prolongé. Nouvelle date de sortie : ${newEndDate}.`,
    messageEn: `Your stay (ref. ${bookingRef}) has been extended. New checkout date: ${newEndDate}.`,
  }),

  BOOKING_EXTENSION_REJECTED: ({ bookingRef }) => ({
    titleFr: 'Demande de prolongation refusée',
    titleEn: 'Extension request declined',
    messageFr: `Votre demande de prolongation pour la réservation ${bookingRef} n'a pas pu être acceptée. Contactez-nous pour plus d'informations.`,
    messageEn: `Your extension request for booking ${bookingRef} could not be approved. Please contact us for more details.`,
  }),

  BOOKING_NO_SHOW: ({ petName, bookingRef }) => ({
    titleFr: 'Réservation marquée comme No Show',
    titleEn: 'Booking marked as No Show',
    messageFr: `Votre réservation pour ${petName} (réf. ${bookingRef}) a été marquée No Show suite à une absence non signalée. Contactez-nous pour toute question.`,
    messageEn: `Your booking for ${petName} (ref. ${bookingRef}) was marked No Show due to unreported absence. Please contact us if you have any questions.`,
  }),

  BOOKING_WAITLISTED: ({ petName, bookingRef }) => ({
    titleFr: "Inscription sur liste d'attente",
    titleEn: 'Added to waitlist',
    messageFr: `La pension est complète sur ces dates. ${petName} (réf. ${bookingRef}) est en liste d'attente — nous vous contactons dès qu'une place se libère.`,
    messageEn: `The boarding is full for these dates. ${petName} (ref. ${bookingRef}) is on the waitlist — we'll reach out as soon as a slot opens up.`,
  }),

  BOOKING_WAITLIST_PROMOTED: ({ petName, bookingRef }) => ({
    titleFr: "Une place s'est libérée !",
    titleEn: 'A slot just opened up!',
    messageFr: `Bonne nouvelle : une place s'est libérée pour ${petName} (réf. ${bookingRef}). Votre réservation est maintenant en attente de confirmation.`,
    messageEn: `Good news: a slot is now available for ${petName} (ref. ${bookingRef}). Your booking is now pending confirmation.`,
  }),

  // ── Invoices ───────────────────────────────────────────────────────────────

  INVOICE_AVAILABLE: ({ invoiceNumber, amount }) => ({
    titleFr: 'Nouvelle facture disponible',
    titleEn: 'New invoice available',
    messageFr: `Votre facture ${invoiceNumber} d'un montant de ${amount} est disponible.`,
    messageEn: `Your invoice ${invoiceNumber} for ${amount} is now available.`,
  }),

  INVOICE_PAID: ({ invoiceNumber, amount }) => ({
    titleFr: 'Paiement confirmé',
    titleEn: 'Payment confirmed',
    messageFr: `Votre facture ${invoiceNumber} d'un montant de ${amount} a bien été réglée. Merci !`,
    messageEn: `Your invoice ${invoiceNumber} for ${amount} has been paid. Thank you!`,
  }),

  // ── Loyalty ────────────────────────────────────────────────────────────────

  LOYALTY_UPDATE: ({ gradeFr, gradeEn }) => ({
    titleFr: 'Grade de fidélité mis à jour',
    titleEn: 'Loyalty grade updated',
    messageFr: `Félicitations ! Votre grade de fidélité a été mis à jour : ${gradeFr}.`,
    messageEn: `Congratulations! Your loyalty grade has been updated: ${gradeEn}.`,
  }),

  LOYALTY_CLAIM_APPROVED: ({ benefitFr, benefitEn }) => ({
    titleFr: 'Avantage fidélité accordé',
    titleEn: 'Loyalty benefit granted',
    messageFr: `Votre demande pour « ${benefitFr} » a été acceptée. Notre équipe vous contactera pour la mise en place.`,
    messageEn: `Your request for "${benefitEn}" has been approved. Our team will contact you shortly.`,
  }),

  LOYALTY_CLAIM_REJECTED: ({ benefitFr, benefitEn, reason }) => ({
    titleFr: "Réclamation d'avantage refusée",
    titleEn: 'Benefit claim rejected',
    messageFr: `Votre demande pour « ${benefitFr} » a été refusée.${reason ? ` Motif : ${reason}` : ''}`,
    messageEn: `Your request for "${benefitEn}" has been rejected.${reason ? ` Reason: ${reason}` : ''}`,
  }),

  // ── Stay media ─────────────────────────────────────────────────────────────

  STAY_PHOTO: ({ petName, bookingRef }) => ({
    titleFr: '📸 Nouvelles photos de séjour',
    titleEn: '📸 New stay photos',
    messageFr: `De nouvelles photos de ${petName} ont été publiées pour votre réservation (réf. ${bookingRef}).`,
    messageEn: `New photos of ${petName} have been posted for your booking (ref. ${bookingRef}).`,
  }),

  STAY_PHOTO_ADDED: ({ names, namesEn }) => ({
    titleFr: '📸 Nouvelles photos de votre séjour',
    titleEn: '📸 New photos from your stay',
    messageFr: `De nouvelles photos de ${names} ont été partagées par l'équipe Dog Universe 🐾`,
    messageEn: `New photos of ${namesEn} were shared by the Dog Universe team 🐾`,
  }),

  // ── Taxi GPS ───────────────────────────────────────────────────────────────

  TAXI_NEAR_PICKUP: () => ({
    titleFr: '🚗 Votre chauffeur arrive',
    titleEn: '🚗 Your driver is arriving',
    messageFr: 'Votre chauffeur arrive dans environ 5 minutes !',
    messageEn: 'Your driver is arriving in about 5 minutes!',
  }),

  TAXI_ARRIVED: () => ({
    titleFr: '✅ Votre chauffeur est arrivé',
    titleEn: '✅ Your driver has arrived',
    messageFr: "Votre chauffeur vient d'arriver à votre adresse.",
    messageEn: 'Your driver has just arrived at your address.',
  }),

  // ── Admin notifications ────────────────────────────────────────────────────

  BOOKING_REQUEST: ({ clientName, serviceTypeFr, serviceTypeEn, petNames, bookingRef }) => ({
    titleFr: 'Nouvelle demande de réservation',
    titleEn: 'New booking request',
    messageFr: `${clientName} a soumis une demande de ${serviceTypeFr} pour ${petNames} — réf. ${bookingRef}`,
    messageEn: `${clientName} submitted a ${serviceTypeEn} request for ${petNames} — ref. ${bookingRef}`,
  }),

  NEW_CLIENT_REGISTRATION: ({ clientName, clientEmail, phonePart }) => ({
    titleFr: 'Nouveau client inscrit',
    titleEn: 'New client registered',
    messageFr: `${clientName} (${clientEmail}${phonePart}) vient de créer un compte.`,
    messageEn: `${clientName} (${clientEmail}${phonePart}) just created an account.`,
  }),

  LOYALTY_CLAIM_PENDING: ({ clientName, benefitFr, benefitEn }) => ({
    titleFr: "Nouvelle réclamation d'avantage fidélité",
    titleEn: 'New loyalty benefit claim',
    messageFr: `${clientName} demande : « ${benefitFr} »`,
    messageEn: `${clientName} requests: "${benefitEn}"`,
  }),

  TAXI_HEARTBEAT_LOST: ({ clientName, petNames, bookingRef }) => ({
    titleFr: 'Taxi : signal GPS perdu',
    titleEn: 'Taxi: GPS signal lost',
    messageFr: `⚠️ Pas de signal GPS depuis 5 min — ${clientName} / ${petNames} / Réservation ${bookingRef}`,
    messageEn: `⚠️ No GPS signal for 5 min — ${clientName} / ${petNames} / Booking ${bookingRef}`,
  }),

  EXTENSION_REQUEST: ({ clientName, petNames, bookingRef, requestedEndDate }) => ({
    titleFr: 'Demande de prolongation de séjour',
    titleEn: 'Stay extension request',
    messageFr: `${clientName} demande une prolongation pour ${petNames} (réf. ${bookingRef}) — nouvelle date de sortie souhaitée : ${requestedEndDate}`,
    messageEn: `${clientName} requests a stay extension for ${petNames} (ref. ${bookingRef}) — requested new checkout: ${requestedEndDate}`,
  }),
};
