import type { EmailTemplateBuilder } from './shared';

/**
 * Booking-domain email templates.
 *
 * Each entry is a builder that receives the precomputed template context
 * (escaped fields, gender/plural helpers, animal-line helpers, date range)
 * and returns the localized subject + body fragments. The shell HTML is
 * applied centrally by `getEmailTemplate` via `wrapEmailHtml()`.
 */
export const bookingTemplates: Record<string, EmailTemplateBuilder> = {
  booking_confirmation: ({ d }) => ({
    subjectFr: '✅ Votre demande de réservation a bien été reçue — Dog Universe',
    subjectEn: '✅ Your booking request has been received — Dog Universe',
    bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Nous avons bien reçu votre demande de réservation <strong>${d.bookingRef}</strong>.</p>
        <p>Notre équipe la traitera sous <strong>24 heures</strong>. Vous recevrez une notification de confirmation dès validation.</p>
        <p style="color: #6B7280; font-size: 14px;">Service : ${d.service} | Animal : ${d.petName}</p>
        <p>À bientôt,<br><strong>L'équipe Dog Universe</strong></p>
      `,
    bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>We have received your booking request <strong>${d.bookingRef}</strong>.</p>
        <p>Our team will process it within <strong>24 hours</strong>. You will receive a confirmation notification once validated.</p>
        <p style="color: #6B7280; font-size: 14px;">Service: ${d.service} | Pet: ${d.petName}</p>
        <p>See you soon,<br><strong>The Dog Universe Team</strong></p>
      `,
  }),

  booking_validated: ({ d, _companionFr, _companionEn, _animalLabelFr, _animalLabelEn, _animalLineFr, _animalLineEn, _dateRangeFr, _dateRangeEn }) => ({
    subjectFr: '✅ Réservation confirmée — Dog Universe',
    subjectEn: '✅ Booking confirmed — Dog Universe',
    bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Excellente nouvelle ! Votre réservation <strong>${d.bookingRef}</strong> a été <strong style="color: #16a34a;">confirmée</strong>.</p>
        <p>Nous attendons ${_companionFr} avec impatience.</p>
        <p style="color: #6B7280; font-size: 14px;">Service : ${d.service} | ${_animalLabelFr} : ${_animalLineFr} | Dates : ${_dateRangeFr}</p>
        <p>À bientôt,<br><strong>L'équipe Dog Universe</strong></p>
      `,
    bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>Great news! Your booking <strong>${d.bookingRef}</strong> has been <strong style="color: #16a34a;">confirmed</strong>.</p>
        <p>We look forward to welcoming ${_companionEn}.</p>
        <p style="color: #6B7280; font-size: 14px;">Service: ${d.service} | ${_animalLabelEn}: ${_animalLineEn} | Dates: ${_dateRangeEn}</p>
        <p>See you soon,<br><strong>The Dog Universe Team</strong></p>
      `,
  }),

  booking_refused: ({ d }) => ({
    subjectFr: 'ℹ️ Réservation non disponible — Dog Universe',
    subjectEn: 'ℹ️ Booking unavailable — Dog Universe',
    bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Nous sommes désolés de vous informer que votre demande de réservation <strong>${d.bookingRef}</strong> ne peut pas être honorée.</p>
        ${d.reason ? `<p>Motif : ${d.reason}</p>` : ''}
        <p>N'hésitez pas à nous contacter ou à soumettre une nouvelle demande pour d'autres dates.</p>
        <p>Cordialement,<br><strong>L'équipe Dog Universe</strong></p>
      `,
    bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>We regret to inform you that your booking request <strong>${d.bookingRef}</strong> cannot be accommodated.</p>
        ${d.reason ? `<p>Reason: ${d.reason}</p>` : ''}
        <p>Please feel free to contact us or submit a new request for other dates.</p>
        <p>Kind regards,<br><strong>The Dog Universe Team</strong></p>
      `,
  }),

  booking_completed: ({ d, _CompanionCap, _verbPres, _arrived, _pret, _recup }) => ({
    subjectFr: d.serviceType === 'PET_TAXI'
      ? `🏁 Trajet terminé — Dog Universe`
      : d.hasGrooming === 'true'
        ? `✅ Séjour & toilettage terminés — Dog Universe`
        : `✅ Séjour terminé — Dog Universe`,
    subjectEn: d.serviceType === 'PET_TAXI'
      ? `🏁 Trip completed — Dog Universe`
      : d.hasGrooming === 'true'
        ? `✅ Stay & grooming completed — Dog Universe`
        : `✅ Stay completed — Dog Universe`,
    bodyFr: d.serviceType === 'PET_TAXI'
      ? `
          <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
          <p>Votre trajet Pet Taxi (réf. <strong>${d.bookingRef}</strong>) est terminé.</p>
          <p><strong>${d.petName}</strong> ${_verbPres} ${_arrived} à destination en toute sécurité.</p>
          <p>Merci de votre confiance,<br><strong>L'équipe Dog Universe</strong></p>
        `
      : d.hasGrooming === 'true'
        ? `
            <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
            <p>Le séjour et le toilettage de <strong>${d.petName}</strong> (réf. <strong>${d.bookingRef}</strong>) sont maintenant terminés.</p>
            <p>${_CompanionCap} ${_verbPres} ${_pret} à être ${_recup}. N'hésitez pas à nous contacter pour convenir de l'heure de passage.</p>
            <p>Merci de votre confiance,<br><strong>L'équipe Dog Universe</strong></p>
          `
        : `
            <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
            <p>Le séjour de <strong>${d.petName}</strong> (réf. <strong>${d.bookingRef}</strong>) est maintenant terminé.</p>
            <p>${_CompanionCap} ${_verbPres} ${_pret} à être ${_recup}. N'hésitez pas à nous contacter pour convenir de l'heure de passage.</p>
            <p>Merci de votre confiance,<br><strong>L'équipe Dog Universe</strong></p>
          `,
    bodyEn: d.serviceType === 'PET_TAXI'
      ? `
          <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
          <p>Your Pet Taxi trip (ref. <strong>${d.bookingRef}</strong>) is now complete.</p>
          <p><strong>${d.petName}</strong> has arrived safely at the destination.</p>
          <p>Thank you for your trust,<br><strong>The Dog Universe Team</strong></p>
        `
      : d.hasGrooming === 'true'
        ? `
            <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
            <p><strong>${d.petName}</strong>'s stay and grooming (ref. <strong>${d.bookingRef}</strong>) are now complete.</p>
            <p>Your companion is ready to be picked up. Feel free to contact us to arrange a pick-up time.</p>
            <p>Thank you for your trust,<br><strong>The Dog Universe Team</strong></p>
          `
        : `
            <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
            <p><strong>${d.petName}</strong>'s stay (ref. <strong>${d.bookingRef}</strong>) is now complete.</p>
            <p>Your companion is ready to be picked up. Feel free to contact us to arrange a pick-up time.</p>
            <p>Thank you for your trust,<br><strong>The Dog Universe Team</strong></p>
          `,
  }),

  invoice_available: ({ d }) => ({
    subjectFr: `📄 Votre facture ${d.invoiceNumber} est disponible — Dog Universe`,
    subjectEn: `📄 Your invoice ${d.invoiceNumber} is available — Dog Universe`,
    bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Votre facture <strong>${d.invoiceNumber}</strong> d'un montant de <strong>${d.amount}</strong> est maintenant disponible dans votre espace client.</p>
        <p>Connectez-vous pour la consulter et la télécharger en PDF.</p>
        <p>Cordialement,<br><strong>L'équipe Dog Universe</strong></p>
      `,
    bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>Your invoice <strong>${d.invoiceNumber}</strong> for <strong>${d.amount}</strong> is now available in your client portal.</p>
        <p>Log in to view and download it as PDF.</p>
        <p>Kind regards,<br><strong>The Dog Universe Team</strong></p>
      `,
  }),

  booking_reminder: ({ d }) => ({
    subjectFr: `🐾 Rappel : votre séjour commence demain — Dog Universe`,
    subjectEn: `🐾 Reminder: your stay starts tomorrow — Dog Universe`,
    bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Petit rappel : votre réservation <strong>${d.bookingRef}</strong> pour <strong>${d.petName}</strong> commence <strong>demain</strong>, le <strong>${d.startDate}</strong>.</p>
        <p style="color: #6B7280; font-size: 14px;">Service : ${d.service}</p>
        <p>Si vous avez des questions ou souhaitez modifier votre réservation, n'hésitez pas à nous contacter.</p>
        <p>À bientôt,<br><strong>L'équipe Dog Universe</strong></p>
      `,
    bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>Just a reminder: your booking <strong>${d.bookingRef}</strong> for <strong>${d.petName}</strong> starts <strong>tomorrow</strong>, on <strong>${d.startDate}</strong>.</p>
        <p style="color: #6B7280; font-size: 14px;">Service: ${d.service}</p>
        <p>If you have any questions or would like to modify your booking, please feel free to contact us.</p>
        <p>See you soon,<br><strong>The Dog Universe Team</strong></p>
      `,
  }),

  stay_end_reminder: ({ d, _companion }) => ({
    subjectFr: `🏠 Fin de séjour demain — ${d.petName} — Dog Universe`,
    subjectEn: `🏠 Stay ending tomorrow — ${d.petName} — Dog Universe`,
    bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Le séjour de <strong>${d.petName}</strong> (réf. <strong>${d.bookingRef}</strong>) se termine <strong>demain</strong>, le <strong>${d.endDate}</strong>.</p>
        <p>Pensez à prévoir votre venue pour récupérer ${_companion}. N'hésitez pas à nous contacter pour convenir de l'heure.</p>
        <p>À bientôt,<br><strong>L'équipe Dog Universe</strong></p>
      `,
    bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p><strong>${d.petName}</strong>'s stay (ref. <strong>${d.bookingRef}</strong>) ends <strong>tomorrow</strong>, on <strong>${d.endDate}</strong>.</p>
        <p>Please plan your visit to pick up your companion. Feel free to contact us to arrange a pick-up time.</p>
        <p>See you soon,<br><strong>The Dog Universe Team</strong></p>
      `,
  }),

  admin_stay_reminder: ({ d }) => ({
    subjectFr: `📋 Rappel séjour demain — ${d.petName} (${d.clientName}) — Dog Universe`,
    subjectEn: `📋 Stay reminder tomorrow — ${d.petName} (${d.clientName}) — Dog Universe`,
    bodyFr: `
        <h2 style="color: #2C2C2C;">Rappel séjour</h2>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0 0 6px;"><strong>Client :</strong> ${d.clientName}</p>
          <p style="margin: 0 0 6px;"><strong>Animal(aux) :</strong> ${d.petName}</p>
          <p style="margin: 0 0 6px;"><strong>Réf. :</strong> ${d.bookingRef}</p>
          <p style="margin: 0;"><strong>${d.reminderType === 'start' ? 'Arrivée' : 'Départ'} :</strong> demain le ${d.date}</p>
        </div>
        <p style="color: #6B7280; font-size: 13px;">Ce rappel automatique est envoyé la veille de l'arrivée ou du départ.</p>
      `,
    bodyEn: `
        <h2 style="color: #2C2C2C;">Stay reminder</h2>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0 0 6px;"><strong>Client:</strong> ${d.clientName}</p>
          <p style="margin: 0 0 6px;"><strong>Pet(s):</strong> ${d.petName}</p>
          <p style="margin: 0 0 6px;"><strong>Ref:</strong> ${d.bookingRef}</p>
          <p style="margin: 0;"><strong>${d.reminderType === 'start' ? 'Check-in' : 'Check-out'}:</strong> tomorrow ${d.date}</p>
        </div>
        <p style="color: #6B7280; font-size: 13px;">This automatic reminder is sent the day before check-in or check-out.</p>
      `,
  }),

  invoice_paid: ({ d }) => ({
    subjectFr: `✅ Paiement confirmé — Facture ${d.invoiceNumber} — Dog Universe`,
    subjectEn: `✅ Payment confirmed — Invoice ${d.invoiceNumber} — Dog Universe`,
    bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Nous confirmons la bonne réception de votre paiement pour la facture <strong>${d.invoiceNumber}</strong>.</p>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0; font-size: 18px; font-weight: bold; color: #2C2C2C;">Montant réglé : ${d.amount}</p>
        </div>
        <p>Connectez-vous à votre espace client pour télécharger votre facture en PDF.</p>
        <p>Merci pour votre confiance,<br><strong>L'équipe Dog Universe</strong></p>
      `,
    bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>We confirm receipt of your payment for invoice <strong>${d.invoiceNumber}</strong>.</p>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0; font-size: 18px; font-weight: bold; color: #2C2C2C;">Amount paid: ${d.amount}</p>
        </div>
        <p>Log in to your client portal to download your invoice as PDF.</p>
        <p>Thank you for your trust,<br><strong>The Dog Universe Team</strong></p>
      `,
  }),

  stay_photo: ({ d }) => ({
    subjectFr: `📸 Nouvelles photos de ${d.petName} disponibles — Dog Universe`,
    subjectEn: `📸 New photos of ${d.petName} available — Dog Universe`,
    bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>De nouvelles photos de <strong>${d.petName}</strong> ont été publiées pour votre réservation <strong>${d.bookingRef}</strong>.</p>
        <p>Connectez-vous à votre espace client pour les consulter !</p>
        <p>À bientôt,<br><strong>L'équipe Dog Universe</strong></p>
      `,
    bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>New photos of <strong>${d.petName}</strong> have been posted for your booking <strong>${d.bookingRef}</strong>.</p>
        <p>Log in to your client portal to see them!</p>
        <p>See you soon,<br><strong>The Dog Universe Team</strong></p>
      `,
  }),

  admin_message: ({ d }) => ({
    subjectFr: `💬 Message de Dog Universe`,
    subjectEn: `💬 Message from Dog Universe`,
    bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0; color: #2C2C2C;">${d.message}</p>
        </div>
        ${d.bookingRef ? `<p style="color: #6B7280; font-size: 13px;">Réservation : ${d.bookingRef}</p>` : ''}
        <p>Cordialement,<br><strong>L'équipe Dog Universe</strong></p>
      `,
    bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0; color: #2C2C2C;">${d.message}</p>
        </div>
        ${d.bookingRef ? `<p style="color: #6B7280; font-size: 13px;">Booking: ${d.bookingRef}</p>` : ''}
        <p>Kind regards,<br><strong>The Dog Universe Team</strong></p>
      `,
  }),
};
