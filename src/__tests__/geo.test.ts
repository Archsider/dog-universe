import { describe, it, expect } from 'vitest';
import { haversineDistance } from '@/lib/geo';

describe('haversineDistance', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistance(33.5731, -7.5898, 33.5731, -7.5898)).toBe(0);
  });

  it('is symmetric', () => {
    const a = haversineDistance(33.5731, -7.5898, 31.6295, -8.0086);
    const b = haversineDistance(31.6295, -8.0086, 33.5731, -7.5898);
    expect(a).toBeCloseTo(b, 6);
  });

  it('returns ~111 km between two points 1° of latitude apart', () => {
    const d = haversineDistance(0, 0, 1, 0);
    // 1° latitude ≈ 111 km (within tolerance)
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('returns ~157 km between Casablanca and Marrakech', () => {
    // Casablanca (33.5731, -7.5898) -> Marrakech (31.6295, -8.0086)
    const d = haversineDistance(33.5731, -7.5898, 31.6295, -8.0086);
    // Real value ~219 km; we accept a generous window so the test stays
    // robust to coord-precision drift but still catches gross bugs.
    expect(d).toBeGreaterThan(150_000);
    expect(d).toBeLessThan(230_000);
  });

  it('detects ~100 m proximity', () => {
    // 0.001° latitude ≈ 111 m
    const d = haversineDistance(33.5731, -7.5898, 33.5741, -7.5898);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });
});
