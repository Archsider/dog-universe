// Pre-stay briefing — schema + helpers for the J-2 owner questionnaire.
//
// Source : audit features 2026-05-19 (Feature #16).  Stored as a JSON blob
// in `PreStayBriefing.formData` so we can extend the form without a migration.

import { z } from 'zod';

export const briefingFormSchema = z.object({
  food:       z.string().max(2000).nullable().optional(),
  toys:       z.string().max(2000).nullable().optional(),
  fears:      z.string().max(2000).nullable().optional(),
  routine:    z.string().max(2000).nullable().optional(),
  vetContact: z.string().max(500).nullable().optional(),
  freeText:   z.string().max(4000).nullable().optional(),
}).strict();

export type BriefingForm = z.infer<typeof briefingFormSchema>;

const EMPTY_FORM: BriefingForm = {
  food: null, toys: null, fears: null, routine: null, vetContact: null, freeText: null,
};

export function parseBriefingForm(raw: string | null): BriefingForm {
  if (!raw) return { ...EMPTY_FORM };
  try {
    const parsed = JSON.parse(raw);
    const result = briefingFormSchema.safeParse(parsed);
    return result.success ? { ...EMPTY_FORM, ...result.data } : { ...EMPTY_FORM };
  } catch {
    return { ...EMPTY_FORM };
  }
}

export function serializeBriefingForm(form: BriefingForm): string {
  // Strip nullish values so the blob stays small.
  const trimmed = Object.fromEntries(
    Object.entries(form).filter(([, v]) => v !== null && v !== undefined && v !== ''),
  );
  return JSON.stringify(trimmed);
}

/** Human-readable summary of a submitted briefing.  Used by the admin booking detail view. */
export function summarizeBriefing(form: BriefingForm, locale: 'fr' | 'en' = 'fr'): { label: string; value: string }[] {
  const labels = locale === 'fr'
    ? {
        food: 'Alimentation',
        toys: 'Jouets / Doudou',
        fears: 'Peurs / Stress',
        routine: 'Routine',
        vetContact: 'Vétérinaire',
        freeText: 'Autres infos',
      }
    : {
        food: 'Food',
        toys: 'Toys / Comfort',
        fears: 'Fears / Stress',
        routine: 'Routine',
        vetContact: 'Vet contact',
        freeText: 'Other notes',
      };
  return (Object.keys(labels) as (keyof BriefingForm)[])
    .map(key => ({ key, label: labels[key], value: (form[key] ?? '').trim() }))
    .filter(row => row.value.length > 0)
    .map(row => ({ label: row.label, value: row.value }));
}
