import { describe, it, expect } from 'vitest';
import { decodePolyline } from '../polyline';

describe('decodePolyline', () => {
  it('decodes the canonical Google reference string', () => {
    // From the Google polyline algorithm spec.
    const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    const points = decodePolyline(encoded);
    expect(points).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });

  it('returns an empty array for an empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });

  it('returns an empty array for a non-string input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- defensive call
    expect(decodePolyline(null as any)).toEqual([]);
  });

  it('decodes a 2-point polyline correctly', () => {
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC');
    expect(points).toHaveLength(2);
    expect(points[0][0]).toBeCloseTo(38.5, 5);
    expect(points[0][1]).toBeCloseTo(-120.2, 5);
  });

  it('returns partial result on malformed truncation (defensive)', () => {
    // Truncate the canonical string in the middle of the 2nd point.
    const truncated = '_p~iF~ps|U_ulLn';
    const points = decodePolyline(truncated);
    // First point always decodes ; second is partial → loop breaks early.
    expect(points.length).toBeGreaterThanOrEqual(1);
    expect(points[0][0]).toBeCloseTo(38.5, 5);
  });

  it('handles an arbitrary encoded geometry without throwing', () => {
    // Synthetic encoded string — smoke test that decoder is robust to
    // arbitrary valid input shapes.
    const encoded = 'mvonHbqvf@dCkA';
    expect(() => decodePolyline(encoded)).not.toThrow();
    const out = decodePolyline(encoded);
    expect(out).toHaveLength(2);
    // Each point is a finite [lat, lng] pair.
    expect(Number.isFinite(out[0][0])).toBe(true);
    expect(Number.isFinite(out[0][1])).toBe(true);
  });
});
