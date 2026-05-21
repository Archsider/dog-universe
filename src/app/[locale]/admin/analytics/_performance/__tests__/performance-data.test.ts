import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  cashByMonth: vi.fn(),
  avgBasket: vi.fn(),
  newClientsCount: vi.fn(),
  volumeByCategory: vi.fn(),
}));

vi.mock('@/lib/metrics/revenue', () => ({ cashByMonth: mocks.cashByMonth }));
vi.mock('@/lib/metrics/operations', () => ({
  avgBasket: mocks.avgBasket,
  newClientsCount: mocks.newClientsCount,
  volumeByCategory: mocks.volumeByCategory,
  deltaPercent: (cur: number, prev: number) => (prev === 0 ? 0 : ((cur - prev) / prev) * 100),
}));

import { getPerformanceData } from '../performance-data';

function entry(month: number, b: number, t: number, g: number, c: number) {
  return { month, total: b + t + g + c, boarding: b, taxi: t, grooming: g, croquettes: c };
}

describe('getPerformanceData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.avgBasket.mockResolvedValue(1400);
    mocks.newClientsCount.mockResolvedValue(13);
    mocks.volumeByCategory.mockResolvedValue({ boarding: 16, taxi: 5, grooming: 3, croquettes: 2, other: 0 });
  });

  it('returns the documented structure with month 5 (May)', async () => {
    const series = Array.from({ length: 12 }, (_, i) =>
      i === 4 ? entry(4, 16540, 1650, 850, 2510) : entry(i, 1000, 0, 0, 0),
    );
    mocks.cashByMonth.mockResolvedValue(series);

    const data = await getPerformanceData(2026, 5);

    expect(data.year).toBe(2026);
    expect(data.month).toBe(5);
    expect(data.monthLabel).toContain('2026');
    expect(data.monthlySeries).toHaveLength(12);
    expect(data.kpis.revenue.value).toBe(16540 + 1650 + 850 + 2510);
    expect(data.kpis.avgBasket.value).toBe(1400);
    expect(data.kpis.newFamilies.value).toBe(13);
    expect(data.kpis.services.value).toBe(16 + 5 + 3 + 2);
    expect(data.hasData).toBe(true);
  });

  it('Σ(categories.revenue) === kpis.revenue.value (coherence criterion)', async () => {
    const series = Array.from({ length: 12 }, (_, i) =>
      i === 4 ? entry(4, 16540, 1650, 850, 2510) : entry(i, 0, 0, 0, 0),
    );
    mocks.cashByMonth.mockResolvedValue(series);
    const data = await getPerformanceData(2026, 5);
    const sum = data.categories.reduce((s, c) => s + c.revenue, 0);
    expect(sum).toBe(data.kpis.revenue.value);
  });

  it('categories sorted by revenue desc, percentages add up to ~100', async () => {
    const series = Array.from({ length: 12 }, (_, i) =>
      i === 4 ? entry(4, 16540, 1650, 850, 2510) : entry(i, 0, 0, 0, 0),
    );
    mocks.cashByMonth.mockResolvedValue(series);
    const data = await getPerformanceData(2026, 5);
    expect(data.categories[0].key).toBe('boarding'); // largest
    const totalPct = data.categories.reduce((s, c) => s + c.percentage, 0);
    expect(totalPct).toBeGreaterThanOrEqual(98);
    expect(totalPct).toBeLessThanOrEqual(101);
  });

  it('delta null when previous month is zero', async () => {
    const series = Array.from({ length: 12 }, (_, i) =>
      i === 4 ? entry(4, 5000, 0, 0, 0) : entry(i, 0, 0, 0, 0),
    );
    mocks.cashByMonth.mockResolvedValue(series);
    mocks.avgBasket.mockResolvedValueOnce(1400).mockResolvedValueOnce(0); // current then previous
    mocks.newClientsCount.mockResolvedValueOnce(13).mockResolvedValueOnce(0);
    const data = await getPerformanceData(2026, 5);
    expect(data.kpis.revenue.delta).toBeNull(); // April = 0
  });

  it('January (month 1) pulls previous month from prior year series', async () => {
    const thisYear = Array.from({ length: 12 }, (_, i) => (i === 0 ? entry(0, 8000, 0, 0, 0) : entry(i, 0, 0, 0, 0)));
    const lastYear = Array.from({ length: 12 }, (_, i) => (i === 11 ? entry(11, 4000, 0, 0, 0) : entry(i, 0, 0, 0, 0)));
    mocks.cashByMonth.mockImplementation((y: number) => Promise.resolve(y === 2026 ? thisYear : lastYear));
    const data = await getPerformanceData(2026, 1);
    // delta vs Dec last year (4000 → 8000 = +100%)
    expect(data.kpis.revenue.delta).toBeCloseTo(100, 0);
  });

  it('empty month → hasData false', async () => {
    mocks.cashByMonth.mockResolvedValue(Array.from({ length: 12 }, (_, i) => entry(i, 0, 0, 0, 0)));
    mocks.avgBasket.mockResolvedValue(0);
    mocks.newClientsCount.mockResolvedValue(0);
    mocks.volumeByCategory.mockResolvedValue({ boarding: 0, taxi: 0, grooming: 0, croquettes: 0, other: 0 });
    const data = await getPerformanceData(2026, 5);
    expect(data.hasData).toBe(false);
    expect(data.categories).toHaveLength(0);
  });
});
