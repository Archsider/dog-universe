import type { EmailTemplateBuilder } from './shared';

/**
 * Loyalty-domain email templates: grade updates and benefit-claim outcomes.
 */
export const loyaltyTemplates: Record<string, EmailTemplateBuilder> = {
  loyalty_update: ({ d }) => ({
    subjectFr: `⭐ Votre grade de fidélité a évolué — Dog Universe`,
    subjectEn: `⭐ Your loyalty grade has been updated — Dog Universe`,
    bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Félicitations ! Votre fidélité a été récompensée.</p>
        <p>Votre grade est maintenant : <strong style="color: #C9A84C; font-size: 18px;">${d.grade}</strong></p>
        ${d.totalStays ? `<p style="color: #6B7280; font-size: 14px;">Séjours complétés : ${d.totalStays}</p>` : ''}
        <p>Connectez-vous à votre espace client pour découvrir vos nouveaux avantages.</p>
        <p>Merci pour votre confiance,<br><strong>L'équipe Dog Universe</strong></p>
      `,
    bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>Congratulations! Your loyalty has been rewarded.</p>
        <p>Your grade is now: <strong style="color: #C9A84C; font-size: 18px;">${d.grade}</strong></p>
        ${d.totalStays ? `<p style="color: #6B7280; font-size: 14px;">Completed stays: ${d.totalStays}</p>` : ''}
        <p>Log in to your client portal to discover your new benefits.</p>
        <p>Thank you for your loyalty,<br><strong>The Dog Universe Team</strong></p>
      `,
  }),

  loyalty_claim_approved: ({ d }) => ({
    subjectFr: `✅ Votre avantage fidélité a été accordé — Dog Universe`,
    subjectEn: `✅ Your loyalty benefit has been granted — Dog Universe`,
    bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Excellente nouvelle ! Votre demande d'avantage a été <strong style="color: #16a34a;">accordée</strong>.</p>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0; font-weight: bold; color: #2C2C2C;">${d.benefitFr}</p>
        </div>
        <p>Notre équipe prendra contact avec vous pour la mise en place de cet avantage.</p>
        <p>Merci pour votre fidélité,<br><strong>L'équipe Dog Universe</strong></p>
      `,
    bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>Great news! Your benefit request has been <strong style="color: #16a34a;">approved</strong>.</p>
        <div style="background: #F5EDD8; border-left: 4px solid #C9A84C; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0; font-weight: bold; color: #2C2C2C;">${d.benefitEn}</p>
        </div>
        <p>Our team will contact you shortly to arrange this benefit.</p>
        <p>Thank you for your loyalty,<br><strong>The Dog Universe Team</strong></p>
      `,
  }),

  loyalty_claim_rejected: ({ d }) => ({
    subjectFr: `ℹ️ Votre réclamation d'avantage fidélité — Dog Universe`,
    subjectEn: `ℹ️ Your loyalty benefit claim — Dog Universe`,
    bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Votre demande pour l'avantage <strong>${d.benefitFr}</strong> n'a malheureusement pas pu être accordée.</p>
        ${d.reason ? `<div style="background: #FEF2F2; border-left: 4px solid #EF4444; padding: 16px; border-radius: 4px; margin: 16px 0;"><p style="margin: 0; color: #991B1B;">Motif : ${d.reason}</p></div>` : ''}
        <p>Si vous avez des questions, n'hésitez pas à nous contacter.</p>
        <p>Cordialement,<br><strong>L'équipe Dog Universe</strong></p>
      `,
    bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>Unfortunately, your request for the benefit <strong>${d.benefitEn}</strong> could not be approved.</p>
        ${d.reason ? `<div style="background: #FEF2F2; border-left: 4px solid #EF4444; padding: 16px; border-radius: 4px; margin: 16px 0;"><p style="margin: 0; color: #991B1B;">Reason: ${d.reason}</p></div>` : ''}
        <p>If you have any questions, please feel free to contact us.</p>
        <p>Kind regards,<br><strong>The Dog Universe Team</strong></p>
      `,
  }),
};
