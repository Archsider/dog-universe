import { describe, it, expect } from 'vitest';
import { computeMonthlyRevenueByCategory } from '../accounting';

// Sémantique A — voir docs/REVENUE_ATTRIBUTION_DECISION.md + en-tête de
// src/lib/accounting.ts. Tests focalisés sur le mécanisme pur. Les cas
// réels (Rita DU-2026-0030, etc.) sont dans `billing.test.ts`.

const mkItem = (category: string, total: number) => ({ category, total });
const mkPayment = (amount: number, paymentDate: string) => ({
  amount,
  paymentDate: new Date(paymentDate),
});

const APRIL_START = new Date('2026-04-01T00:00:00Z');
const APRIL_END = new Date('2026-04-30T23:59:59.999Z');
const MAY_START = new Date('2026-05-01T00:00:00Z');
const MAY_END = new Date('2026-05-31T23:59:59.999Z');

describe('computeMonthlyRevenueByCategory — sémantique A', () => {
  it('Alexandra Bon (Lina) — acompte avril + solde mai → TOUT en mai', () => {
    // Facture clôturée au payment du 6 mai. Sous A, l'acompte d'avril ne
    // bascule plus en avril : la totalité du CA ventilé tombe en mai.
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

    const may = computeMonthlyRevenueByCategory(payments, items, MAY_START, MAY_END);
    expect(may.boarding).toBe(1440);
    expect(may.taxi).toBe(300);
    expect(may.croquettes).toBe(200);
    expect(may.grooming).toBe(0);
    expect(may.other).toBe(0);

    const april = computeMonthlyRevenueByCategory(payments, items, APRIL_START, APRIL_END);
    expect(april.boarding).toBe(0);
    expect(april.taxi).toBe(0);
    expect(april.croquettes).toBe(0);
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

  it('Paiement excédentaire (over-payment) → contribue plein montant des items', () => {
    // 800 payés, items totalisant 500 → fully paid (800 ≥ 500). Le surplus
    // de 300 n'est PAS ventilé (il n'a aucun item à attribuer). Le breakdown
    // reflète juste le `total` des items.
    const items = [mkItem('BOARDING', 500)];
    const payments = [mkPayment(800, '2026-05-10')];

    const result = computeMonthlyRevenueByCategory(payments, items, MAY_START, MAY_END);

    expect(result.boarding).toBe(500);
  });

  it('Sous-payé d\'1 centime → fully paid (tolérance arrondi)', () => {
    const items = [mkItem('BOARDING', 100)];
    const payments = [mkPayment(99.99, '2026-05-10')];

    const result = computeMonthlyRevenueByCategory(payments, items, MAY_START, MAY_END);

    expect(result.boarding).toBe(100);
  });

  it('Sous-payé de 2 centimes → 0 (au-delà de la tolérance, PARTIALLY_PAID)', () => {
    const items = [mkItem('BOARDING', 100)];
    const payments = [mkPayment(99.98, '2026-05-10')];

    const result = computeMonthlyRevenueByCategory(payments, items, MAY_START, MAY_END);

    expect(result.boarding).toBe(0);
  });

  it('Trois paiements multi-mois → tout sur le mois du dernier payment', () => {
    // 500 + 300 + 200 = 1000 = total items. Fully paid au 15 mai (dernier
    // payment). Sous A : 100 % du CA bascule en mai, rien en avril malgré
    // l'acompte d'avril.
    const items = [
      mkItem('BOARDING', 600),
      mkItem('GROOMING', 300),
      mkItem('PRODUCT', 100),
    ];
    const payments = [
      mkPayment(500, '2026-04-20'),
      mkPayment(300, '2026-05-05'),
      mkPayment(200, '2026-05-15'),
    ];

    const may = computeMonthlyRevenueByCategory(payments, items, MAY_START, MAY_END);
    expect(may.boarding).toBe(600);
    expect(may.grooming).toBe(300);
    expect(may.croquettes).toBe(100);

    const april = computeMonthlyRevenueByCategory(payments, items, APRIL_START, APRIL_END);
    expect(april.boarding).toBe(0);
    expect(april.grooming).toBe(0);
  });

  it('Payments désordonnés (DB ordering) → ordre date asc utilisé pour lastPayment', () => {
    // Payments saisis dans un ordre arbitraire (createdAt n'est pas
    // paymentDate). La fonction trouve lastPayment = max(paymentDate).
    const items = [mkItem('BOARDING', 1440), mkItem('PET_TAXI', 150)];
    const payments = [
      mkPayment(940, '2026-05-06'),    // dernier (mai)
      mkPayment(1000, '2026-04-24'),   // premier (avril)
    ];

    const may = computeMonthlyRevenueByCategory(payments, items, MAY_START, MAY_END);
    // totalPaid 1940 >= 1590 fully paid, lastPayment 6 mai → IN may
    expect(may.boarding).toBe(1440);
    expect(may.taxi).toBe(150);
  });

  it('PARTIALLY_PAID — facture pas encore close → 0 partout', () => {
    // Acompte 500 sur facture 1000 — la facture continuera de bouger.
    // Sémantique A : pas de contribution tant qu'elle n'est pas clôturée.
    const items = [mkItem('BOARDING', 1000)];
    const payments = [mkPayment(500, '2026-05-10')];

    const result = computeMonthlyRevenueByCategory(payments, items, MAY_START, MAY_END);

    expect(result.boarding).toBe(0);
  });
});
