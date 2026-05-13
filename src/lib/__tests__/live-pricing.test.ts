import { describe, it, expect } from 'vitest';
import { computeLiveTotal, liveNightsSince } from '@/lib/live-pricing';
import { PRICING_DEFAULTS } from '@/lib/pricing-rules';

const pricing = PRICING_DEFAULTS;

function days(n: number): Date {
  const d = new Date('2026-05-13T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
const NOW = new Date('2026-05-13T12:00:00Z');

describe('liveNightsSince', () => {
  it('floors to at least 1 night when same calendar day', () => {
    expect(liveNightsSince(NOW, NOW)).toBe(1);
  });
  it('counts whole nights elapsed since startDate', () => {
    expect(liveNightsSince(days(26), NOW)).toBe(26);
  });
});

describe('computeLiveTotal — pension rates', () => {
  it('single dog short stay → 120/night', () => {
    const { total, nights } = computeLiveTotal(
      { startDate: days(26), pets: [{ species: 'DOG' }] },
      pricing,
      NOW,
    );
    expect(nights).toBe(26);
    expect(total).toBe(26 * 120); // 3120
  });

  it('single dog 1 night → 120 MAD (matches Zakaria case)', () => {
    const { total } = computeLiveTotal(
      { startDate: days(1), pets: [{ species: 'DOG' }] },
      pricing,
      NOW,
    );
    expect(total).toBe(120);
  });

  it('single dog long stay (≥ 32 nights) → 100/night for ALL nights', () => {
    const { total } = computeLiveTotal(
      { startDate: days(33), pets: [{ species: 'DOG' }] },
      pricing,
      NOW,
    );
    expect(total).toBe(33 * 100); // 3300 — matches Karim case (without addons)
  });

  it('2+ dogs short stay → 100/dog/night', () => {
    const { total } = computeLiveTotal(
      {
        startDate: days(5),
        pets: [{ species: 'DOG' }, { species: 'DOG' }],
      },
      pricing,
      NOW,
    );
    expect(total).toBe(5 * 100 * 2); // 1000
  });

  it('cat → 70/night regardless of dog rules', () => {
    const { total } = computeLiveTotal(
      { startDate: days(10), pets: [{ species: 'CAT' }] },
      pricing,
      NOW,
    );
    expect(total).toBe(10 * 70);
  });

  it('mixed dog + cat short stay → dog at 120, cat at 70', () => {
    const { total } = computeLiveTotal(
      {
        startDate: days(5),
        pets: [{ species: 'DOG' }, { species: 'CAT' }],
      },
      pricing,
      NOW,
    );
    // dog count = 1 → single-dog 120
    expect(total).toBe(5 * 120 + 5 * 70); // 950
  });
});

describe('computeLiveTotal — add-ons', () => {
  it('adds taxi go + return (2 × taxi_standard)', () => {
    const { total, pensionTotal, addonTotal } = computeLiveTotal(
      {
        startDate: days(3),
        pets: [{ species: 'DOG' }],
        addons: { taxiGoEnabled: true, taxiReturnEnabled: true },
      },
      pricing,
      NOW,
    );
    expect(pensionTotal).toBe(3 * 120);
    expect(addonTotal).toBe(2 * pricing.taxi_standard);
    expect(total).toBe(pensionTotal + addonTotal);
  });

  it('adds grooming when groomingPrice > 0', () => {
    const { addonTotal } = computeLiveTotal(
      {
        startDate: days(2),
        pets: [{ species: 'DOG' }],
        addons: { groomingPrice: 150 },
      },
      pricing,
      NOW,
    );
    expect(addonTotal).toBe(150);
  });

  it('ignores grooming when 0 or missing', () => {
    const { addonTotal } = computeLiveTotal(
      {
        startDate: days(2),
        pets: [{ species: 'DOG' }],
        addons: { groomingPrice: 0 },
      },
      pricing,
      NOW,
    );
    expect(addonTotal).toBe(0);
  });
});
