import { describe, it, expect } from 'vitest';
import { computeMonthlyRevenueByCategory } from '../accounting';

// L'ordre des items est la responsabilité du caller (Prisma orderBy id asc).
// Les tests passent les items dans l'ordre attendu.
const mkItem = (category: string, total: number) => ({ category, total });
const mkPayment = (amount: number, paymentDate: string) => ({
  amount,
  paymentDate: new Date(paymentDate),
});

const MAY_START = new Date('2026-05-01T00:00:00Z');
const MAY_END = new Date('2026-05-31T23:59:59.999Z');

describe('computeMonthlyRevenueByCategory — allocation séquentielle', () => {
  it('Alexandra Bon — Lina — allocation correcte mai 2026', () => {
    const items = [
      mkItem('BOARDING', 1440),
      mkItem('PET_TAXI', 150),
      mkItem('PET_TAXI', 150),
      mkItem('PRODUCT', 200),
    ];
    const payments = [
      mkPayment(1000, '2026-04-24'),
      mkPayment(940, '2026-05-06'),
    ];

    const result = computeMonthlyRevenueByCategory(payments, items, MAY_START, MAY_END);

    expect(result.boarding).toBe(440);
    expect(result.taxi).toBe(300);
    expect(result.croquettes).toBe(200);
    expect(result.grooming).toBe(0);
    expect(result.other).toBe(0);
  });

  it('Aucun paiement → 0 partout (jamais de prorata fictif)', () => {
    const result = computeMonthlyRevenueByCategory(
      [],
      [mkItem('BOARDING', 1800)],
      MAY_START,
      MAY_END,
    );
    expect(result.boarding).toBe(0);
    expect(result.taxi).toBe(0);
    expect(result.grooming).toBe(0);
    expect(result.croquettes).toBe(0);
    expect(result.other).toBe(0);
  });

  it('Paiement total dans le mois → tout le CA tombe ce mois', () => {
    const items = [mkItem('BOARDING', 1800), mkItem('PET_TAXI', 150)];
    const payments = [mkPayment(1950, '2026-05-12')];

    const result = computeMonthlyRevenueByCategory(payments, items, MAY_START, MAY_END);

    expect(result.boarding).toBe(1800);
    expect(result.taxi).toBe(150);
  });

  it('Paiement antérieur au mois cible → 0 ce mois', () => {
    const items = [mkItem('BOARDING', 800)];
    const payments = [mkPayment(800, '2026-04-15')];

    const result = computeMonthlyRevenueByCategory(payments, items, MAY_START, MAY_END);

    expect(result.boarding).toBe(0);
  });

  it('Paiement excédentaire (over-payment) → ignore le surplus', () => {
    const items = [mkItem('BOARDING', 500)];
    const payments = [mkPayment(800, '2026-05-10')];

    const result = computeMonthlyRevenueByCategory(payments, items, MAY_START, MAY_END);

    expect(result.boarding).toBe(500);
  });

  it('Trois paiements multi-mois → ventilation correcte', () => {
    const items = [
      mkItem('BOARDING', 600),
      mkItem('GROOMING', 300),
      mkItem('PRODUCT', 100),
    ];
    const payments = [
      mkPayment(500, '2026-04-20'),  // BOARDING 500/600 → avril
      mkPayment(300, '2026-05-05'),  // BOARDING 100 + GROOMING 200 → mai
      mkPayment(200, '2026-05-15'),  // GROOMING 100 + PRODUCT 100 → mai
    ];

    const result = computeMonthlyRevenueByCategory(payments, items, MAY_START, MAY_END);

    expect(result.boarding).toBe(100);
    expect(result.grooming).toBe(300);
    expect(result.croquettes).toBe(100);
  });

  it('Payments désordonnés → triés par date avant allocation', () => {
    const items = [mkItem('BOARDING', 1440), mkItem('PET_TAXI', 150)];
    const payments = [
      mkPayment(940, '2026-05-06'),
      mkPayment(1000, '2026-04-24'),
    ];

    const result = computeMonthlyRevenueByCategory(payments, items, MAY_START, MAY_END);

    expect(result.boarding).toBe(440);
    expect(result.taxi).toBe(150);
  });
});
