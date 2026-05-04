import type { EmailTemplateBuilder } from './shared';

/**
 * Billing-domain email templates — relances de factures impayées.
 *
 * Champs `data` attendus :
 *   - clientName : nom du client (HTML-escaped par buildTemplateContext)
 *   - invoiceNumber : numéro de facture (DU-2026-0001)
 *   - amountDue : montant restant dû déjà formaté (ex: "1 250,00 MAD")
 *   - issuedAt : date d'émission déjà formatée (ex: "5 avril 2026")
 *   - portalUrl : lien direct vers /client/invoices/[id]
 */
export const billingTemplates: Record<string, EmailTemplateBuilder> = {
  invoice_overdue_30: ({ d }) => ({
    subjectFr: `Rappel : facture ${d.invoiceNumber} en attente de règlement`,
    subjectEn: `Reminder: invoice ${d.invoiceNumber} awaiting payment`,
    bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Notre facture <strong>${d.invoiceNumber}</strong> émise le ${d.issuedAt} pour un montant restant dû de <strong>${d.amountDue}</strong> n'apparaît pas encore comme réglée dans nos registres.</p>
        <p>Si le règlement a déjà été effectué, merci d'ignorer ce message.</p>
        <p>Sinon, nous vous remercions de bien vouloir procéder au paiement dans les meilleurs délais. Vous pouvez consulter le détail de la facture depuis votre espace client.</p>
        <p style="margin: 24px 0;"><a href="${d.portalUrl}" style="background: #D4AF37; color: #141428; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Voir la facture</a></p>
        <p>Pour toute question, n'hésitez pas à nous contacter.</p>
        <p>Cordialement,<br><strong>L'équipe Dog Universe</strong></p>
      `,
    bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>Our invoice <strong>${d.invoiceNumber}</strong> issued on ${d.issuedAt} for a remaining balance of <strong>${d.amountDue}</strong> does not yet appear as settled in our records.</p>
        <p>If payment has already been made, please disregard this message.</p>
        <p>Otherwise, we kindly ask you to settle the balance at your earliest convenience. You may review the invoice from your client portal.</p>
        <p style="margin: 24px 0;"><a href="${d.portalUrl}" style="background: #D4AF37; color: #141428; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">View invoice</a></p>
        <p>Should you have any question, feel free to reach out.</p>
        <p>Best regards,<br><strong>The Dog Universe Team</strong></p>
      `,
  }),

  invoice_overdue_60: ({ d }) => ({
    subjectFr: `Second rappel : facture ${d.invoiceNumber} impayée depuis 60 jours`,
    subjectEn: `Second reminder: invoice ${d.invoiceNumber} unpaid for 60 days`,
    bodyFr: `
        <h2 style="color: #2C2C2C;">Bonjour ${d.clientName},</h2>
        <p>Malgré notre précédent rappel, la facture <strong>${d.invoiceNumber}</strong> émise le ${d.issuedAt} reste impayée pour un montant de <strong>${d.amountDue}</strong>.</p>
        <p>Nous vous demandons de bien vouloir régulariser cette situation sous <strong>7 jours</strong>. Au-delà de ce délai, nous serons contraints de suspendre l'accès aux services réservés et d'engager une procédure de recouvrement.</p>
        <p style="margin: 24px 0;"><a href="${d.portalUrl}" style="background: #D4AF37; color: #141428; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Régler la facture</a></p>
        <p>Si vous rencontrez une difficulté de paiement, contactez-nous afin de convenir d'un échéancier.</p>
        <p>Cordialement,<br><strong>L'équipe Dog Universe</strong></p>
      `,
    bodyEn: `
        <h2 style="color: #2C2C2C;">Hello ${d.clientName},</h2>
        <p>Despite our previous reminder, invoice <strong>${d.invoiceNumber}</strong> issued on ${d.issuedAt} remains unpaid for an amount of <strong>${d.amountDue}</strong>.</p>
        <p>We ask you to settle this balance within <strong>7 days</strong>. Beyond this deadline, we will have to suspend access to booked services and initiate a collection procedure.</p>
        <p style="margin: 24px 0;"><a href="${d.portalUrl}" style="background: #D4AF37; color: #141428; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Settle invoice</a></p>
        <p>Should you face any payment difficulty, please contact us to agree on a schedule.</p>
        <p>Best regards,<br><strong>The Dog Universe Team</strong></p>
      `,
  }),
};
