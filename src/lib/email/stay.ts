import type { EmailTemplateBuilder } from './shared';

/**
 * Stay-related email templates (in-stay communication, weekly report).
 */
export const stayTemplates: Record<string, EmailTemplateBuilder> = {
  /**
   * Weekly AI-generated stay report sent to clients with an active IN_PROGRESS boarding.
   *
   * d.aiReport   — the AI-generated paragraph (may be fallback generic text)
   * d.petName    — pet name(s), already HTML-escaped by buildTemplateContext
   * d.photo1Url  — optional, first photo URL (raw URL, not escaped — must be safe)
   * d.photo2Url  — optional, second photo URL
   * d.photo3Url  — optional, third photo URL
   * d.bookingUrl — link to the client booking detail page
   */
  weekly_pet_report: ({ d }) => ({
    subjectFr: `🐾 Rapport hebdomadaire de ${d.petName} — Dog Universe`,
    subjectEn: `🐾 Weekly report for ${d.petName} — Dog Universe`,
    bodyFr: `
        ${d.aiReport}
        ${d.photo1Url ? `
        <div style="margin: 16px 0;">
          <img src="${d.photo1Url}" alt="Photo de ${d.petName}" style="max-width: 100%; border-radius: 8px; margin-bottom: 8px;" />
          ${d.photo2Url ? `<img src="${d.photo2Url}" alt="Photo de ${d.petName}" style="max-width: 100%; border-radius: 8px; margin-bottom: 8px;" />` : ''}
          ${d.photo3Url ? `<img src="${d.photo3Url}" alt="Photo de ${d.petName}" style="max-width: 100%; border-radius: 8px; margin-bottom: 8px;" />` : ''}
        </div>` : ''}
        <p style="margin-top: 16px;">
          <a href="${d.bookingUrl}" style="background: #C9A84C; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Voir toutes les photos
          </a>
        </p>
        <p style="margin-top: 16px;">À très bientôt,<br><strong>L'équipe Dog Universe</strong></p>
      `,
    bodyEn: `
        ${d.aiReport}
        ${d.photo1Url ? `
        <div style="margin: 16px 0;">
          <img src="${d.photo1Url}" alt="Photo of ${d.petName}" style="max-width: 100%; border-radius: 8px; margin-bottom: 8px;" />
          ${d.photo2Url ? `<img src="${d.photo2Url}" alt="Photo of ${d.petName}" style="max-width: 100%; border-radius: 8px; margin-bottom: 8px;" />` : ''}
          ${d.photo3Url ? `<img src="${d.photo3Url}" alt="Photo of ${d.petName}" style="max-width: 100%; border-radius: 8px; margin-bottom: 8px;" />` : ''}
        </div>` : ''}
        <p style="margin-top: 16px;">
          <a href="${d.bookingUrl}" style="background: #C9A84C; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            View all photos
          </a>
        </p>
        <p style="margin-top: 16px;">See you soon,<br><strong>The Dog Universe Team</strong></p>
      `,
  }),
};
