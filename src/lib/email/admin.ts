import type { EmailTemplateBuilder } from './shared';

/**
 * Admin/ops-facing email templates (sent to ADMIN/SUPERADMIN, not clients).
 *
 * `morning_digest` — daily operational recap sent ~07h Casablanca. Expected
 * `data` fields (all pre-formatted strings, HTML-escaped by buildTemplateContext):
 *   dateLabel, arrivalsCount, departuresCount, presentCount, pendingCount,
 *   unpaidCount, unpaidTotal, dogsLine, catsLine, arrivalsText, departuresText,
 *   dashboardUrl, billingUrl
 */
export const adminTemplates: Record<string, EmailTemplateBuilder> = {
  morning_digest: ({ d }) => ({
    subjectFr: `Votre journée chez Dog Universe — ${d.dateLabel}`,
    subjectEn: `Your day at Dog Universe — ${d.dateLabel}`,
    bodyFr: `
        <h2 style="color: #2C2C2C; margin-bottom: 4px;">Bonjour 👋</h2>
        <p style="color: #6B6B6B; margin-top: 0;">Voici votre point du matin — ${d.dateLabel}.</p>

        <table role="presentation" width="100%" style="border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 10px 14px; background: #FEFCF9; border: 1px solid rgba(196,151,74,0.2); border-radius: 8px;">
              <strong style="font-size: 22px; color: #2C2C2C;">${d.arrivalsCount}</strong><br>
              <span style="font-size: 12px; color: #8A7E75;">Arrivées</span>
            </td>
            <td style="width: 10px;"></td>
            <td style="padding: 10px 14px; background: #FEFCF9; border: 1px solid rgba(196,151,74,0.2); border-radius: 8px;">
              <strong style="font-size: 22px; color: #2C2C2C;">${d.departuresCount}</strong><br>
              <span style="font-size: 12px; color: #8A7E75;">Départs</span>
            </td>
            <td style="width: 10px;"></td>
            <td style="padding: 10px 14px; background: #FEFCF9; border: 1px solid rgba(196,151,74,0.2); border-radius: 8px;">
              <strong style="font-size: 22px; color: #2C2C2C;">${d.presentCount}</strong><br>
              <span style="font-size: 12px; color: #8A7E75;">Présents</span>
            </td>
            <td style="width: 10px;"></td>
            <td style="padding: 10px 14px; background: ${d.pendingCount === '0' ? '#FEFCF9' : '#FEF3E2'}; border: 1px solid rgba(196,151,74,0.2); border-radius: 8px;">
              <strong style="font-size: 22px; color: #2C2C2C;">${d.pendingCount}</strong><br>
              <span style="font-size: 12px; color: #8A7E75;">À valider</span>
            </td>
          </tr>
        </table>

        <p style="margin: 8px 0;"><strong>Arrivées :</strong> ${d.arrivalsText}</p>
        <p style="margin: 8px 0;"><strong>Départs :</strong> ${d.departuresText}</p>
        <p style="margin: 8px 0;"><strong>Occupation :</strong> 🐶 ${d.dogsLine} &nbsp;·&nbsp; 🐱 ${d.catsLine}</p>
        <p style="margin: 8px 0;"><strong>Impayées :</strong> ${d.unpaidCount} facture(s) — ${d.unpaidTotal} restant</p>

        <p style="margin: 24px 0;">
          <a href="${d.dashboardUrl}" style="background: #D4AF37; color: #141428; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Ouvrir le dashboard</a>
          &nbsp;
          <a href="${d.billingUrl}" style="color: #9A7235; text-decoration: underline; font-weight: 600;">Voir les impayés</a>
        </p>
        <p style="color: #8A7E75; font-size: 12px;">Bonne journée — Dog Universe</p>
      `,
    bodyEn: `
        <h2 style="color: #2C2C2C; margin-bottom: 4px;">Good morning 👋</h2>
        <p style="color: #6B6B6B; margin-top: 0;">Here is your morning brief — ${d.dateLabel}.</p>

        <table role="presentation" width="100%" style="border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 10px 14px; background: #FEFCF9; border: 1px solid rgba(196,151,74,0.2); border-radius: 8px;">
              <strong style="font-size: 22px; color: #2C2C2C;">${d.arrivalsCount}</strong><br>
              <span style="font-size: 12px; color: #8A7E75;">Arrivals</span>
            </td>
            <td style="width: 10px;"></td>
            <td style="padding: 10px 14px; background: #FEFCF9; border: 1px solid rgba(196,151,74,0.2); border-radius: 8px;">
              <strong style="font-size: 22px; color: #2C2C2C;">${d.departuresCount}</strong><br>
              <span style="font-size: 12px; color: #8A7E75;">Departures</span>
            </td>
            <td style="width: 10px;"></td>
            <td style="padding: 10px 14px; background: #FEFCF9; border: 1px solid rgba(196,151,74,0.2); border-radius: 8px;">
              <strong style="font-size: 22px; color: #2C2C2C;">${d.presentCount}</strong><br>
              <span style="font-size: 12px; color: #8A7E75;">Present</span>
            </td>
            <td style="width: 10px;"></td>
            <td style="padding: 10px 14px; background: ${d.pendingCount === '0' ? '#FEFCF9' : '#FEF3E2'}; border: 1px solid rgba(196,151,74,0.2); border-radius: 8px;">
              <strong style="font-size: 22px; color: #2C2C2C;">${d.pendingCount}</strong><br>
              <span style="font-size: 12px; color: #8A7E75;">To validate</span>
            </td>
          </tr>
        </table>

        <p style="margin: 8px 0;"><strong>Arrivals:</strong> ${d.arrivalsText}</p>
        <p style="margin: 8px 0;"><strong>Departures:</strong> ${d.departuresText}</p>
        <p style="margin: 8px 0;"><strong>Occupancy:</strong> 🐶 ${d.dogsLine} &nbsp;·&nbsp; 🐱 ${d.catsLine}</p>
        <p style="margin: 8px 0;"><strong>Unpaid:</strong> ${d.unpaidCount} invoice(s) — ${d.unpaidTotal} remaining</p>

        <p style="margin: 24px 0;">
          <a href="${d.dashboardUrl}" style="background: #D4AF37; color: #141428; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Open dashboard</a>
          &nbsp;
          <a href="${d.billingUrl}" style="color: #9A7235; text-decoration: underline; font-weight: 600;">View unpaid</a>
        </p>
        <p style="color: #8A7E75; font-size: 12px;">Have a great day — Dog Universe</p>
      `,
  }),
};
