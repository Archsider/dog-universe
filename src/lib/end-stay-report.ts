// End-of-stay report — pure helpers (no I/O). The PR introduces a new
// "Rapport de fin de séjour" feature: admin opens a form on
// `/admin/reservations/[id]/end-report`, fills 5 sections (behaviour /
// food / sleep / activities / health) with predefined checkboxes and a
// free-text area each, plus a closing note. The form's `formData` is
// serialised into a Notification message body sent through the existing
// ADMIN_MESSAGE pipeline (with `type = 'END_STAY_REPORT'`).
//
// This module exports:
//   - The canonical SECTION_KEYS + their checkbox catalogue (FR/EN)
//   - `buildEndStayReportMessage(formData, ctx)` — pure function returning
//     the final text body. The endpoint persists this string into both
//     EndStayReport.finalMessage and Notification.messageFr.
//
// SCOPING NOTE for AI step 2 (see docs/END_STAY_REPORT_AI.md): the prompt
// template will use the SAME section keys + checkbox lists so the admin
// edit/review UX stays identical whether the draft was hand-typed or
// AI-generated. `formData.version` distinguishes 1 (manual) from 2+ (AI).

export type SectionKey =
  | 'behaviour'
  | 'food'
  | 'sleep'
  | 'activities'
  | 'health';

export interface SectionDef {
  key: SectionKey;
  titleFr: string;
  titleEn: string;
  /** Checkbox catalogue. Stable IDs the formData persists. */
  checkboxes: { id: string; labelFr: string; labelEn: string }[];
}

// The 5 sections + their predefined checkboxes. Order matters — the final
// message renders sections in this exact sequence.
export const SECTIONS: readonly SectionDef[] = [
  {
    key: 'behaviour',
    titleFr: 'Comportement et intégration',
    titleEn: 'Behaviour and integration',
    checkboxes: [
      { id: 'calm', labelFr: 'Calme', labelEn: 'Calm' },
      { id: 'social', labelFr: 'Sociable', labelEn: 'Sociable' },
      { id: 'anxious_start', labelFr: 'Anxieux au début', labelEn: 'Anxious at first' },
      { id: 'playful', labelFr: 'Joueur', labelEn: 'Playful' },
      { id: 'reserved', labelFr: 'Réservé', labelEn: 'Reserved' },
    ],
  },
  {
    key: 'food',
    titleFr: 'Alimentation',
    titleEn: 'Food',
    checkboxes: [
      { id: 'ate_normally', labelFr: 'Mangé normalement', labelEn: 'Ate normally' },
      { id: 'irregular_appetite', labelFr: 'Appétit irrégulier', labelEn: 'Irregular appetite' },
      { id: 'refused_some_meals', labelFr: 'A refusé certains repas', labelEn: 'Refused some meals' },
      { id: 'well_hydrated', labelFr: 'Bien hydraté', labelEn: 'Well hydrated' },
    ],
  },
  {
    key: 'sleep',
    titleFr: 'Sommeil et repos',
    titleEn: 'Sleep and rest',
    checkboxes: [
      { id: 'slept_well', labelFr: 'Bien dormi', labelEn: 'Slept well' },
      { id: 'night_wakings', labelFr: 'Réveils nocturnes', labelEn: 'Night wakings' },
      { id: 'regular_naps', labelFr: 'Sieste régulière', labelEn: 'Regular naps' },
    ],
  },
  {
    key: 'activities',
    titleFr: 'Activités et sorties',
    titleEn: 'Activities and outings',
    checkboxes: [
      { id: 'daily_outings', labelFr: 'Sorties quotidiennes', labelEn: 'Daily outings' },
      { id: 'play_other_animals', labelFr: 'Jeux avec autres animaux', labelEn: 'Played with other animals' },
      { id: 'walks', labelFr: 'Promenades', labelEn: 'Walks' },
      { id: 'brushing', labelFr: 'Brossage', labelEn: 'Brushing' },
    ],
  },
  {
    key: 'health',
    titleFr: 'Santé et observations',
    titleEn: 'Health and observations',
    checkboxes: [
      { id: 'ras', labelFr: 'RAS', labelEn: 'Nothing to report' },
      { id: 'mild_fatigue_day1', labelFr: 'Légère fatigue départ jour 1', labelEn: 'Mild fatigue on day 1' },
      { id: 'minor_incident', labelFr: 'Incident mineur', labelEn: 'Minor incident' },
    ],
  },
] as const;

export interface SectionFormData {
  /** Stable ID of each checked box in this section. */
  checked: string[];
  /** Admin free-text comment for this section. Can be empty. */
  freeText: string;
}

export interface EndStayReportFormData {
  sections: Record<SectionKey, SectionFormData>;
  /** Free-text closing line (e.g. "Ce fut un plaisir d'accueillir Chippie."). */
  closingNote: string;
  /** Schema version — 1 = manual template. Reserved 2+ for AI-generated. */
  version: 1;
}

export interface EndStayReportContext {
  locale: 'fr' | 'en';
  clientName: string;
  /** Animal names already grouped (e.g. "Chippie", "Max et Luna"). */
  petLabel: string;
  /** Human-readable stay range: "Du 8 au 15 mai 2026 · 7 nuits" or similar. */
  stayLabel: string;
  /** Service rendered (Pension, Pet Taxi, etc) — already localised. */
  serviceLabel: string;
}

const SECTION_BULLET_FR = '•';
const SECTION_BULLET_EN = '•';

function renderSection(
  section: SectionDef,
  data: SectionFormData,
  locale: 'fr' | 'en',
): string | null {
  const title = locale === 'fr' ? section.titleFr : section.titleEn;
  const checkedLabels = data.checked
    .map((id) => section.checkboxes.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => (locale === 'fr' ? c.labelFr : c.labelEn));

  const freeText = data.freeText.trim();

  // Skip the section entirely if nothing was checked AND no free text was
  // entered. Avoids a wall of empty headings on a half-filled report.
  if (checkedLabels.length === 0 && !freeText) return null;

  const bullet = locale === 'fr' ? SECTION_BULLET_FR : SECTION_BULLET_EN;
  const lines: string[] = [title];
  if (checkedLabels.length > 0) {
    lines.push(`${bullet} ${checkedLabels.join(', ')}`);
  }
  if (freeText) {
    lines.push(freeText);
  }
  return lines.join('\n');
}

/**
 * Renders the final report body that gets posted to the client. Pure: no
 * I/O, no clock, no Prisma. The endpoint passes the result to both
 * `EndStayReport.finalMessage` and `Notification.messageFr`.
 *
 * Localised: the same `formData` produces either a French or English body
 * depending on `ctx.locale`. The Notification row still mirrors both fr/en
 * fields (we render twice, once per locale, in the endpoint).
 */
export function buildEndStayReportMessage(
  formData: EndStayReportFormData,
  ctx: EndStayReportContext,
): string {
  const isFr = ctx.locale === 'fr';

  // Vouvoyé header (FR) / formal salutation (EN) — pattern the user
  // specified: "Bonjour [Client], voici le rapport de fin de séjour de
  // [pet] pour le séjour [stay]..."
  const intro = isFr
    ? `Bonjour ${ctx.clientName},\n\nVoici le rapport de fin de séjour de ${ctx.petLabel} — ${ctx.serviceLabel}, ${ctx.stayLabel}.`
    : `Hello ${ctx.clientName},\n\nHere is the end-of-stay report for ${ctx.petLabel} — ${ctx.serviceLabel}, ${ctx.stayLabel}.`;

  const sectionsRendered = SECTIONS.map((section) =>
    renderSection(section, formData.sections[section.key], ctx.locale),
  ).filter((s): s is string => s !== null);

  const closing = formData.closingNote.trim();
  const defaultClosing = isFr
    ? `Ce fut un plaisir d'accueillir ${ctx.petLabel}. Toute l'équipe Dog Universe.`
    : `It was a pleasure hosting ${ctx.petLabel}. — The Dog Universe team.`;
  const closingLine = closing || defaultClosing;

  return [intro, ...sectionsRendered, closingLine].join('\n\n');
}

/**
 * Returns true if the form has enough content to be sent: at least one
 * section must have either a checked box OR free text. The closing note
 * alone is not enough. Used by the UI to gate the "Send" button.
 */
export function isFormReadyToSend(formData: EndStayReportFormData): boolean {
  return SECTIONS.some((s) => {
    const section = formData.sections[s.key];
    return section.checked.length > 0 || section.freeText.trim().length > 0;
  });
}

/** Build an empty formData scaffold — all sections present, all empty. */
export function emptyFormData(): EndStayReportFormData {
  const sections = {} as Record<SectionKey, SectionFormData>;
  for (const s of SECTIONS) {
    sections[s.key] = { checked: [], freeText: '' };
  }
  return { sections, closingNote: '', version: 1 };
}
