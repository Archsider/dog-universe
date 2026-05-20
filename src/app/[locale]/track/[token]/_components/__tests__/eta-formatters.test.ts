import { describe, it, expect } from 'vitest';
import { formatEta, formatDistance } from '../HeaderFooter';

describe('formatEta', () => {
  it('returns "imminent" tier under 60 seconds', () => {
    expect(formatEta(30, true)).toBe('Arrivée imminente');
    expect(formatEta(59, false)).toBe('Arriving');
    expect(formatEta(0, true)).toBe('Arrivée imminente');
  });

  it('returns minutes-only tier between 1 and 59 min', () => {
    expect(formatEta(7 * 60, true)).toBe('Arrivée dans 7 min');
    expect(formatEta(7 * 60, false)).toBe('Arriving in 7 min');
    // Boundary : exactly 60s rounds to 1 min
    expect(formatEta(60, true)).toBe('Arrivée dans 1 min');
    // 59 minutes still in minutes tier
    expect(formatEta(59 * 60, true)).toBe('Arrivée dans 59 min');
  });

  it('returns hours-and-minutes tier ≥ 60 min', () => {
    expect(formatEta(60 * 60, true)).toBe('Arrivée dans 1h');
    expect(formatEta(72 * 60, true)).toBe('Arrivée dans 1h 12min');
    expect(formatEta(72 * 60, false)).toBe('Arriving in 1h 12min');
    expect(formatEta(2 * 3600 + 5 * 60, true)).toBe('Arrivée dans 2h 5min');
  });

  it('handles negative / non-finite gracefully', () => {
    expect(formatEta(-1, true)).toBe('Calcul…');
    expect(formatEta(NaN, false)).toBe('Computing…');
    expect(formatEta(Infinity, true)).toBe('Calcul…');
  });
});

describe('formatDistance', () => {
  it('uses meters under 1 km', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(450)).toBe('450 m');
    expect(formatDistance(999)).toBe('999 m');
  });

  it('uses 2-decimal km between 1 and 10 km', () => {
    expect(formatDistance(1000)).toBe('1.00 km');
    expect(formatDistance(3247)).toBe('3.25 km');
    expect(formatDistance(9999)).toBe('10.00 km');
  });

  it('uses 1-decimal km at 10+ km', () => {
    expect(formatDistance(10000)).toBe('10.0 km');
    expect(formatDistance(42500)).toBe('42.5 km');
  });

  it('returns empty string on invalid input', () => {
    expect(formatDistance(-1)).toBe('');
    expect(formatDistance(NaN)).toBe('');
  });
});
