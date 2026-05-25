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
  occupancy7d: [
    { label: '24/05', dogsCount: 6, catsCount: 2 },
    { label: '25/05', dogsCount: 14, catsCount: 9 },
    { label: '26/05', dogsCount: 11, catsCount: 4 },
  ],
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

  it('surfaces the busiest upcoming day per species (peak), against the limit', () => {
    const d = buildMorningDigestData(base);
    expect(d.occupancyPeakShown).toBe('1');
    expect(d.dogsPeakText).toBe('25/05 — 14/20'); // 14 is the max dog day
    expect(d.catsPeakText).toBe('25/05 — 9/10');
  });

  it('hides the peak line and dashes the text when the 7-day window is all zero', () => {
    const d = buildMorningDigestData({
      ...base,
      occupancy7d: [
        { label: '24/05', dogsCount: 0, catsCount: 0 },
        { label: '25/05', dogsCount: 0, catsCount: 0 },
      ],
    });
    expect(d.occupancyPeakShown).toBe('0');
    expect(d.dogsPeakText).toBe('—');
    expect(d.catsPeakText).toBe('—');
  });

  it('shows a dog peak even when cats stay empty (independent per species)', () => {
    const d = buildMorningDigestData({
      ...base,
      occupancy7d: [{ label: '24/05', dogsCount: 3, catsCount: 0 }],
    });
    expect(d.occupancyPeakShown).toBe('1');
    expect(d.dogsPeakText).toBe('24/05 — 3/20');
    expect(d.catsPeakText).toBe('—');
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
