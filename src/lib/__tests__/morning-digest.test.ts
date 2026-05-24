import { describe, it, expect } from 'vitest';
import { buildMorningDigestData, buildMorningDigestSummary, type MorningDigestInput } from '@/lib/morning-digest';

const base: MorningDigestInput = {
  dateLabel: 'vendredi 23 mai 2026',
  arrivals: [{ name: 'Alice', time: '10:00' }, { name: 'Bob', time: null }],
  departures: [{ name: 'Carla' }],
  presentCount: 8,
  pendingCount: 2,
  unpaidCount: 3,
  unpaidTotalLabel: '3 200 MAD',
  dogsIn: 8,
  dogsLimit: 20,
  catsIn: 3,
  catsLimit: 10,
  birthdays: [{ petName: 'Max', ownerName: 'Mehdi' }, { petName: 'Luna', ownerName: '' }],
  vaccines: [{ petName: 'Rex', vaccineType: 'Rage', expiry: '2026-06-10' }],
  dashboardUrl: 'https://app/fr/admin/dashboard',
  billingUrl: 'https://app/fr/admin/billing?status=PENDING',
};

describe('buildMorningDigestData', () => {
  it('maps counts and occupancy lines to strings', () => {
    const d = buildMorningDigestData(base);
    expect(d.arrivalsCount).toBe('2');
    expect(d.departuresCount).toBe('1');
    expect(d.presentCount).toBe('8');
    expect(d.pendingCount).toBe('2');
    expect(d.unpaidCount).toBe('3');
    expect(d.unpaidTotal).toBe('3 200 MAD');
    expect(d.dogsLine).toBe('8 / 20');
    expect(d.catsLine).toBe('3 / 10');
  });

  it('renders arrival names with time when present, plain otherwise', () => {
    const d = buildMorningDigestData(base);
    expect(d.arrivalsText).toBe('Alice (10:00), Bob');
    expect(d.departuresText).toBe('Carla');
  });

  it('uses a dash when there are no arrivals/departures', () => {
    const d = buildMorningDigestData({ ...base, arrivals: [], departures: [] });
    expect(d.arrivalsText).toBe('—');
    expect(d.departuresText).toBe('—');
    expect(d.arrivalsCount).toBe('0');
  });

  it('passes through the dashboard + billing links', () => {
    const d = buildMorningDigestData(base);
    expect(d.dashboardUrl).toBe('https://app/fr/admin/dashboard');
    expect(d.billingUrl).toBe('https://app/fr/admin/billing?status=PENDING');
  });

  it('renders birthdays with owner in parentheses (omitted when blank) + count', () => {
    const d = buildMorningDigestData(base);
    expect(d.birthdaysCount).toBe('2');
    expect(d.birthdaysText).toBe('Max (Mehdi), Luna');
  });

  it('renders vaccines as "pet — type (expiry)" + count', () => {
    const d = buildMorningDigestData(base);
    expect(d.vaccinesCount).toBe('1');
    expect(d.vaccinesText).toBe('Rex — Rage (2026-06-10)');
  });

  it('uses a dash + 0 count when there are no birthdays/vaccines', () => {
    const d = buildMorningDigestData({ ...base, birthdays: [], vaccines: [] });
    expect(d.birthdaysCount).toBe('0');
    expect(d.birthdaysText).toBe('—');
    expect(d.vaccinesCount).toBe('0');
    expect(d.vaccinesText).toBe('—');
  });
});

describe('buildMorningDigestSummary', () => {
  it('produces a one-line FR summary', () => {
    expect(buildMorningDigestSummary(base, 'fr')).toBe(
      '2 arrivées · 1 départs · 8 présents · 2 à valider · 3 impayées',
    );
  });

  it('produces a one-line EN summary', () => {
    expect(buildMorningDigestSummary(base, 'en')).toBe(
      '2 arrivals · 1 departures · 8 present · 2 to validate · 3 unpaid',
    );
  });
});
