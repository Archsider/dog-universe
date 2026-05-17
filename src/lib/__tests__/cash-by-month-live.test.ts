/**
 * cashByMonth — Sémantique B regression test.
 *
 * Context: depuis le pivot Sémantique B (PR #105, 2026-05-17), la
 * materialized view `monthly_revenue_mv` lit `InvoiceItem.category` brut
 * sans inférence sur `description`. Conséquence : les items legacy
 * persistés en `category=OTHER` (créés avant que la colonne soit
 * obligatoire) tombent dans le bucket `other` → courbes Pension/Taxi/…
 * plates à 0 sur les mois récents (visible sur /admin/analytics
 * "Performance par activité").
 *
 * Fix : `cashByMonth` ne lit plus la MV. Elle appelle 12 fois
 * `computeRevenueByCategoryProrataLive` en parallèle, qui re-classifie
 * via `inferItemCategory(category, description)` côté JS.
 *
 * Ce test verrouille le contrat : pour un mois donné où un item legacy
 * `OTHER` a une description "Pension 5 nuits", le total `boarding` doit
 * être > 0 et `other` doit être 0.
 *
 * Voir PR analytics-fix-redesign-may17.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    invoice: { findMany: vi.fn() },
    monthlyRevenueSummary: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));

import { cashByMonth } from '../metrics';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.invoice.findMany.mockResolvedValue([]);
});

describe('cashByMonth — re-classifies legacy OTHER items via description', () => {
  it('attributes a legacy "Pension 5 nuits" item (category=OTHER) to boarding bucket', async () => {
    // 1 invoice, 1 item legacy classed OTHER with a boarding description.
    // Fully paid in May 2026 → must land in `boarding`, not `other`.
    const paymentDate = new Date('2026-05-10T10:00:00Z');
    const mayInvoice = {
      items: [
        {
          category: 'OTHER',
          description: 'Pension 5 nuits',
          total: '600.00',
        },
      ],
      payments: [
        { amount: '600.00', paymentDate },
      ],
    };

    // Default empty for 11 months; May (index 4 → mEnd around 2026-05-31)
    // returns the legacy invoice. We mock by month-start filter inspection.
    mocks.prisma.invoice.findMany.mockImplementation((args: { where: { OR?: unknown[] } } | undefined) => {
      // Heuristic : presence of getMonthlyInvoicesWhere() returns an OR
      // array even when mocked. We return the legacy invoice once.
      const where = args?.where as { OR?: unknown[] };
      void where;
      return Promise.resolve([mayInvoice]);
    });

    const months = await cashByMonth(2026);
    expect(months).toHaveLength(12);

    // At least one month has boarding > 0 (because every month gets the
    // mocked invoice — we just verify the classification path works).
    const someBoarding = months.some(m => m.boarding > 0);
    expect(someBoarding).toBe(true);

    // None should leak into a fictional "other" bucket inside MonthlyEntry
    // (the shape doesn't expose `other`, but `total` must equal the sum
    // of classified buckets — proof that nothing is lost).
    for (const m of months) {
      const sumClassified = m.boarding + m.taxi + m.grooming + m.croquettes;
      // total >= classified always ; on the Sémantique B fix path the
      // delta represents OTHER items that have no description match.
      // For our fixture the description always matches "Pension" → delta = 0.
      expect(m.total).toBe(sumClassified);
    }
  });

  it('handles empty months (no invoices) gracefully', async () => {
    mocks.prisma.invoice.findMany.mockResolvedValue([]);
    const months = await cashByMonth(2026);
    expect(months).toHaveLength(12);
    for (const m of months) {
      expect(m.total).toBe(0);
      expect(m.boarding).toBe(0);
      expect(m.taxi).toBe(0);
      expect(m.grooming).toBe(0);
      expect(m.croquettes).toBe(0);
    }
  });

  it('runs 12 month queries in parallel (one prisma call per month)', async () => {
    mocks.prisma.invoice.findMany.mockResolvedValue([]);
    await cashByMonth(2026);
    // computeRevenueByCategoryProrataLive issues 1 findMany per call.
    // 12 months → 12 findMany.
    expect(mocks.prisma.invoice.findMany).toHaveBeenCalledTimes(12);
  });
});
