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

  /**
   * Daily Report Card — admin-curated daily update during IN_PROGRESS boarding.
   *
   * d.clientFirstName — pre-escaped first name (or empty)
   * d.petName         — pre-escaped pet name
   * d.dateLong        — pretty date 'mardi 19 mai 2026' / 'Tuesday, May 19, 2026'
   * d.note            — pre-escaped one-sentence note (optional)
   * d.moodEmoji       — single emoji or empty
   * d.foodEmoji       — single emoji or empty
   * d.sleepEmoji      — single emoji or empty
   * d.playEmoji       — single emoji or empty
   * d.photo1Url       — optional photo URLs (raw — already pre-validated server-side)
   * d.photo2Url
   * d.photo3Url
   */
  daily_report: ({ d, isFr }) => {
    const photos = [d.photo1Url, d.photo2Url, d.photo3Url].filter(Boolean);
    const photosHtml = photos.length === 0 ? '' : `
        <div style="margin: 16px 0; display: block;">
          ${photos.map(url => `
            <img src="${url}" alt="${isFr ? `Photo de ${d.petName}` : `Photo of ${d.petName}`}" style="max-width: 100%; border-radius: 12px; margin-bottom: 8px; display: block;" />
          `).join('')}
        </div>`;
    // Emoji chips — only render rows that have a value, in a clean grid.
    const labelsFr = { mood: 'Humeur', food: 'Appétit', sleep: 'Sommeil', play: 'Jeu' };
    const labelsEn = { mood: 'Mood',   food: 'Appetite', sleep: 'Sleep',  play: 'Play' };
    const labels = isFr ? labelsFr : labelsEn;
    const emojiPairs: [string, string, string][] = [
      ['mood',  labels.mood,  d.moodEmoji],
      ['food',  labels.food,  d.foodEmoji],
      ['sleep', labels.sleep, d.sleepEmoji],
      ['play',  labels.play,  d.playEmoji],
    ];
    const emojiHtml = emojiPairs.filter(([, , v]) => v).map(([, label, v]) => `
      <div style="display: inline-block; margin: 4px 8px 4px 0; padding: 8px 14px; background: #FFF9E8; border: 1px solid #F0D98A; border-radius: 999px; font-size: 14px; color: #2C2C2C;">
        <span style="color: #8B6914; font-weight: 600; margin-right: 6px;">${label}</span>
        <span style="font-size: 18px;">${v}</span>
      </div>`).join('');
    const greetingFr = d.clientFirstName ? `Bonjour ${d.clientFirstName},` : 'Bonjour,';
    const greetingEn = d.clientFirstName ? `Hello ${d.clientFirstName},` : 'Hello,';
    const noteHtml = d.note && d.note.trim().length > 0
      ? `<p style="font-size: 15px; line-height: 1.6; color: #2C2C2C; margin: 16px 0;">${d.note}</p>`
      : '';
    return {
      subjectFr: `🐾 Nouvelles de ${d.petName} — ${d.dateLong}`,
      subjectEn: `🐾 News from ${d.petName} — ${d.dateLong}`,
      bodyFr: `
        <h2 style="color: #2C2C2C; margin: 0 0 6px;">${greetingFr}</h2>
        <p style="color: #6B7280; margin: 0 0 18px; font-size: 14px;">Voici les nouvelles de <strong>${d.petName}</strong> aujourd'hui.</p>
        ${photosHtml}
        ${emojiHtml ? `<div style="margin: 16px 0;">${emojiHtml}</div>` : ''}
        ${noteHtml}
        <p style="margin-top: 24px; font-size: 13px; color: #6B7280;">Une carte par jour pendant tout le séjour. À demain !<br><strong>L'équipe Dog Universe</strong></p>
      `,
      bodyEn: `
        <h2 style="color: #2C2C2C; margin: 0 0 6px;">${greetingEn}</h2>
        <p style="color: #6B7280; margin: 0 0 18px; font-size: 14px;">Here's how <strong>${d.petName}</strong> is doing today.</p>
        ${photosHtml}
        ${emojiHtml ? `<div style="margin: 16px 0;">${emojiHtml}</div>` : ''}
        ${noteHtml}
        <p style="margin-top: 24px; font-size: 13px; color: #6B7280;">One card every day during the stay. See you tomorrow!<br><strong>The Dog Universe Team</strong></p>
      `,
    };
  },
};
