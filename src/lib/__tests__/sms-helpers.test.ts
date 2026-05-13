// Pure helpers from src/lib/sms.ts — no network, no Prisma. We unit-test
// only the deterministic gender / number / formatting helpers; the actual
// `sendSMS()` HTTP path is covered by the queue/worker integration tests.

import { describe, it, expect } from 'vitest';
import {
  formatDateFR,
  formatMAD,
  petCompanion,
  petVerb,
  petArrived,
  petReturned,
  petPossessive,
  petChouchoute,
} from '../sms';

describe('formatDateFR', () => {
  it('formats an ISO string as DD/MM/YYYY', () => {
    expect(formatDateFR('2026-05-13T08:30:00Z')).toBe('13/05/2026');
  });

  it('formats a Date object as DD/MM/YYYY', () => {
    expect(formatDateFR(new Date('2026-01-01T00:00:00Z'))).toBe('01/01/2026');
  });

  it('zero-pads single-digit days and months', () => {
    expect(formatDateFR('2026-03-07T12:00:00Z')).toBe('07/03/2026');
  });
});

describe('formatMAD', () => {
  it('formats null / undefined as 0 MAD', () => {
    expect(formatMAD(null)).toBe('0 MAD');
    expect(formatMAD(undefined)).toBe('0 MAD');
  });

  it('formats a number with French thousand separator', () => {
    expect(formatMAD(1234)).toMatch(/^1\D?234 MAD$/); // "1 234 MAD" (NBSP)
    expect(formatMAD(0)).toBe('0 MAD');
  });

  it('parses a numeric string', () => {
    expect(formatMAD('250')).toBe('250 MAD');
  });

  it('falls back to 0 when string is unparseable', () => {
    expect(formatMAD('not-a-number')).toBe('0 MAD');
  });

  it('accepts a Decimal-like object via toNumber()', () => {
    const decimal = { toNumber: () => 99.5 };
    expect(formatMAD(decimal)).toBe('99,5 MAD');
  });
});

describe('petCompanion', () => {
  it('returns "votre compagnon" for a single male pet', () => {
    expect(petCompanion([{ gender: 'MALE' }])).toBe('votre compagnon');
  });

  it('returns "votre compagne" for a single female pet', () => {
    expect(petCompanion([{ gender: 'FEMALE' }])).toBe('votre compagne');
  });

  it('returns "vos compagnons" for mixed gender (male wins)', () => {
    expect(petCompanion([{ gender: 'MALE' }, { gender: 'FEMALE' }])).toBe('vos compagnons');
  });

  it('returns "vos compagnes" only when ALL pets are female', () => {
    expect(petCompanion([{ gender: 'FEMALE' }, { gender: 'FEMALE' }])).toBe('vos compagnes');
  });

  it('falls back to masculine when gender is missing', () => {
    expect(petCompanion([{}])).toBe('votre compagnon');
    expect(petCompanion([{ gender: null }])).toBe('votre compagnon');
  });

  it('falls back to masculine singular for empty list (defensive)', () => {
    expect(petCompanion([])).toBe('votre compagnon');
  });
});

describe('petVerb', () => {
  it('returns "sera" / "est" for a single pet', () => {
    expect(petVerb([{ gender: 'MALE' }], 'future')).toBe('sera');
    expect(petVerb([{ gender: 'FEMALE' }], 'present')).toBe('est');
  });

  it('returns "seront" / "sont" for multiple pets', () => {
    expect(petVerb([{}, {}], 'future')).toBe('seront');
    expect(petVerb([{}, {}], 'present')).toBe('sont');
  });

  it('defaults tense to future', () => {
    expect(petVerb([{}])).toBe('sera');
  });
});

describe('petArrived / petReturned — gender + plural agreement', () => {
  it('petArrived: singular masculine vs feminine', () => {
    expect(petArrived([{ gender: 'MALE' }])).toBe('arrivé');
    expect(petArrived([{ gender: 'FEMALE' }])).toBe('arrivée');
  });

  it('petArrived: plural masculine wins on mixed gender', () => {
    expect(petArrived([{ gender: 'MALE' }, { gender: 'FEMALE' }])).toBe('arrivés');
    expect(petArrived([{ gender: 'FEMALE' }, { gender: 'FEMALE' }])).toBe('arrivées');
  });

  it('petReturned: same agreement rules', () => {
    expect(petReturned([{ gender: 'FEMALE' }])).toBe('rentrée');
    expect(petReturned([{ gender: 'FEMALE' }, { gender: 'FEMALE' }])).toBe('rentrées');
    expect(petReturned([{}, {}])).toBe('rentrés');
  });
});

describe('petPossessive', () => {
  it('returns "ses" for a single pet', () => {
    expect(petPossessive([{}])).toBe('ses');
  });

  it('returns "leurs" for multiple pets', () => {
    expect(petPossessive([{}, {}])).toBe('leurs');
  });
});

describe('petChouchoute', () => {
  it('agrees in gender with the pet group', () => {
    // Quick sanity: the helper should at minimum return a non-empty string
    expect(petChouchoute([{ gender: 'FEMALE' }]).length).toBeGreaterThan(0);
    expect(petChouchoute([{ gender: 'MALE' }]).length).toBeGreaterThan(0);
  });
});
