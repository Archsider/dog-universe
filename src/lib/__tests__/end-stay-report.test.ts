import { describe, it, expect } from 'vitest';
import {
  buildEndStayReportMessage,
  emptyFormData,
  isFormReadyToSend,
  SECTIONS,
  type EndStayReportContext,
  type EndStayReportFormData,
} from '../end-stay-report';

const baseCtx: EndStayReportContext = {
  locale: 'fr',
  clientName: 'Mme Kabbaj',
  petLabel: 'Chippie',
  stayLabel: 'Du 8 au 15 mai 2026 · 7 nuits',
  serviceLabel: 'Pension',
};

function withSection(
  formData: EndStayReportFormData,
  key: EndStayReportFormData['sections'] extends Record<infer K, unknown> ? K : never,
  patch: Partial<EndStayReportFormData['sections'][typeof key]>,
): EndStayReportFormData {
  return {
    ...formData,
    sections: {
      ...formData.sections,
      [key]: { ...formData.sections[key], ...patch },
    },
  };
}

describe('SECTIONS catalogue', () => {
  it('declares exactly the 5 sections from the spec', () => {
    expect(SECTIONS.map((s) => s.key)).toEqual([
      'behaviour',
      'food',
      'sleep',
      'activities',
      'health',
    ]);
  });

  it('every checkbox has FR + EN label + stable id', () => {
    for (const section of SECTIONS) {
      for (const cb of section.checkboxes) {
        expect(cb.id).toMatch(/^[a-z_0-9]+$/);
        expect(cb.labelFr.length).toBeGreaterThan(0);
        expect(cb.labelEn.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('emptyFormData', () => {
  it('creates the full scaffold with all 5 sections present + empty', () => {
    const empty = emptyFormData();
    expect(Object.keys(empty.sections).sort()).toEqual([
      'activities',
      'behaviour',
      'food',
      'health',
      'sleep',
    ]);
    for (const s of SECTIONS) {
      expect(empty.sections[s.key].checked).toEqual([]);
      expect(empty.sections[s.key].freeText).toBe('');
    }
    expect(empty.closingNote).toBe('');
    expect(empty.version).toBe(1);
  });
});

describe('isFormReadyToSend — guard for the Send button', () => {
  it('false on a completely empty form', () => {
    expect(isFormReadyToSend(emptyFormData())).toBe(false);
  });

  it('false when only the closingNote is filled', () => {
    const f = { ...emptyFormData(), closingNote: 'Au plaisir.' };
    expect(isFormReadyToSend(f)).toBe(false);
  });

  it('true once any section has at least 1 checkbox', () => {
    const f = withSection(emptyFormData(), 'behaviour', { checked: ['calm'] });
    expect(isFormReadyToSend(f)).toBe(true);
  });

  it('true once any section has free text', () => {
    const f = withSection(emptyFormData(), 'food', { freeText: 'a très bien mangé' });
    expect(isFormReadyToSend(f)).toBe(true);
  });
});

describe('buildEndStayReportMessage — rendering', () => {
  it('produces the FR intro with vouvoiement + pet label + stay label', () => {
    const f = withSection(emptyFormData(), 'behaviour', { checked: ['calm'] });
    const msg = buildEndStayReportMessage(f, baseCtx);
    expect(msg).toContain('Bonjour Mme Kabbaj');
    expect(msg).toContain('Chippie');
    expect(msg).toContain('Du 8 au 15 mai 2026 · 7 nuits');
    expect(msg).toContain('Pension');
  });

  it('produces a different EN intro when locale=en', () => {
    const f = withSection(emptyFormData(), 'behaviour', { checked: ['calm'] });
    const msg = buildEndStayReportMessage(f, { ...baseCtx, locale: 'en' });
    expect(msg).toContain('Hello Mme Kabbaj');
    expect(msg).toContain('Here is the end-of-stay report');
    expect(msg).not.toContain('Bonjour');
  });

  it('skips sections with no checkbox AND no free text', () => {
    const f = withSection(emptyFormData(), 'behaviour', { checked: ['calm'] });
    // Only "behaviour" filled — the other 4 sections must NOT appear.
    const msg = buildEndStayReportMessage(f, baseCtx);
    expect(msg).toContain('Comportement et intégration');
    expect(msg).not.toContain('Alimentation');
    expect(msg).not.toContain('Sommeil et repos');
    expect(msg).not.toContain('Activités et sorties');
    expect(msg).not.toContain('Santé et observations');
  });

  it('renders checked labels in a comma list under the section title', () => {
    const f = withSection(emptyFormData(), 'behaviour', {
      checked: ['calm', 'social', 'playful'],
    });
    const msg = buildEndStayReportMessage(f, baseCtx);
    expect(msg).toContain('Calme, Sociable, Joueur');
  });

  it('renders free text below the checkboxes when both are present', () => {
    const f = withSection(emptyFormData(), 'food', {
      checked: ['ate_normally'],
      freeText: 'A mangé toutes ses gamelles avec entrain.',
    });
    const msg = buildEndStayReportMessage(f, baseCtx);
    const lines = msg.split('\n');
    const titleIdx = lines.findIndex((l) => l === 'Alimentation');
    expect(titleIdx).toBeGreaterThan(-1);
    expect(lines[titleIdx + 1]).toContain('Mangé normalement');
    expect(lines[titleIdx + 2]).toContain('toutes ses gamelles');
  });

  it('uses the default closing when closingNote is empty', () => {
    const f = withSection(emptyFormData(), 'behaviour', { checked: ['calm'] });
    const msg = buildEndStayReportMessage(f, baseCtx);
    expect(msg).toContain('Ce fut un plaisir');
    expect(msg).toContain('Toute l\'équipe Dog Universe');
  });

  it('uses the admin-provided closing when set', () => {
    const f = withSection(emptyFormData(), 'behaviour', { checked: ['calm'] });
    f.closingNote = 'À bientôt pour le prochain séjour de Chippie ! — Mehdi';
    const msg = buildEndStayReportMessage(f, baseCtx);
    expect(msg).toContain('À bientôt pour le prochain séjour de Chippie ! — Mehdi');
    expect(msg).not.toContain('Ce fut un plaisir');
  });

  it('ignores unknown checkbox ids gracefully (no crash, no rendering)', () => {
    // Defensive: if the form ships an outdated checkbox id (e.g. after a
    // schema change), the renderer must drop it silently rather than 500.
    const f = withSection(emptyFormData(), 'behaviour', {
      checked: ['calm', 'BOGUS_ID_THAT_DOES_NOT_EXIST'],
    });
    const msg = buildEndStayReportMessage(f, baseCtx);
    expect(msg).toContain('Calme');
    expect(msg).not.toContain('BOGUS_ID_THAT_DOES_NOT_EXIST');
  });

  it('produces a complete report when all 5 sections are filled', () => {
    let f = emptyFormData();
    f = withSection(f, 'behaviour', { checked: ['calm', 'social'], freeText: 'Très équilibrée.' });
    f = withSection(f, 'food', { checked: ['ate_normally'], freeText: 'Appétit nickel.' });
    f = withSection(f, 'sleep', { checked: ['slept_well'], freeText: 'Sieste 14h.' });
    f = withSection(f, 'activities', { checked: ['daily_outings'], freeText: 'Brossage tous les 2j.' });
    f = withSection(f, 'health', { checked: ['ras'], freeText: '' });
    f.closingNote = 'Hâte de la revoir.';
    const msg = buildEndStayReportMessage(f, baseCtx);
    expect(msg).toContain('Comportement et intégration');
    expect(msg).toContain('Alimentation');
    expect(msg).toContain('Sommeil et repos');
    expect(msg).toContain('Activités et sorties');
    expect(msg).toContain('Santé et observations');
    expect(msg).toContain('Hâte de la revoir.');
  });
});

describe('buildEndStayReportMessage — multi-pets', () => {
  it('handles a multi-pet petLabel verbatim (caller pre-formats)', () => {
    // The helper is purely pass-through on petLabel — caller is responsible
    // for "Max et Luna" / "Max, Luna and Rex" formatting (already done in
    // src/lib/email.ts joinNames helpers).
    const f = withSection(emptyFormData(), 'behaviour', { checked: ['social'] });
    const msg = buildEndStayReportMessage(f, { ...baseCtx, petLabel: 'Max, Luna et Rex' });
    expect(msg).toContain('Max, Luna et Rex');
  });
});
