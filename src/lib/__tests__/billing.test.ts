import { describe, it, expect } from 'vitest';
import { getMonthlyInvoicesWhere, resolveItemCategory } from '../billing';
import {
  computeMonthlyRevenueByCategory,
  allocateBetweenItems,
  isInvoiceClosedInMonth,
} from '../accounting';

const APRIL_START = new Date('2026-04-01T00:00:00Z');
const APRIL_END = new Date('2026-04-30T23:59:59.999Z');
const MAY_START = new Date('2026-05-01T00:00:00Z');
const MAY_END = new Date('2026-05-31T23:59:59.999Z');

const mkItem = (category: string, total: number, description = '') => ({
  category,
  total,
  description,
});
const mkPayment = (amount: number, paymentDate: string) => ({
  amount,
  paymentDate: new Date(paymentDate),
});

// ===========================================================================
// getMonthlyInvoicesWhere — structure Prisma.InvoiceWhereInput
// ===========================================================================
describe('getMonthlyInvoicesWhere', () => {
  it('renvoie un OR des 3 cas comptables', () => {
    const where = getMonthlyInvoicesWhere(MAY_START, MAY_END);
    expect(where.OR).toBeDefined();
    expect(Array.isArray(where.OR)).toBe(true);
    expect(where.OR!.length).toBe(3);
  });

  it('CAS 1 — paiement encaissé ce mois', () => {
    const where = getMonthlyInvoicesWhere(MAY_START, MAY_END);
    const c1 = where.OR![0] as Record<string, unknown>;
    expect(c1.payments).toEqual({
      some: { paymentDate: { gte: MAY_START, lte: MAY_END } },
    });
  });

  it('CAS 2 — séjour CONFIRMED/IN_PROGRESS/COMPLETED sans paiement', () => {
    const where = getMonthlyInvoicesWhere(MAY_START, MAY_END);
    const c2 = where.OR![1] as Record<string, unknown>;
    expect(c2.payments).toEqual({ none: { paymentDate: { gte: MAY_START, lte: MAY_END } } });
    const booking = c2.booking as Record<string, unknown>;
    expect((booking.status as Record<string, unknown>).in).toEqual([
      'CONFIRMED',
      'IN_PROGRESS',
      'COMPLETED',
    ]);
    expect(booking.startDate).toEqual({ lte: MAY_END });
    expect(Array.isArray(booking.OR)).toBe(true);
  });

  it('CAS 3 — facture manuelle (bookingId null) ce mois', () => {
    const where = getMonthlyInvoicesWhere(MAY_START, MAY_END);
    const c3 = where.OR![2] as Record<string, unknown>;
    expect(c3.bookingId).toBe(null);
    expect(c3.issuedAt).toEqual({ gte: MAY_START, lte: MAY_END });
  });
});

// ===========================================================================
// resolveItemCategory — productId verrouille la catégorie
// ===========================================================================
describe('resolveItemCategory', () => {
  it('productId présent → PRODUCT, peu importe le fallback', () => {
    expect(resolveItemCategory('prod_123', 'BOARDING')).toBe('PRODUCT');
    expect(resolveItemCategory('prod_123', 'OTHER')).toBe('PRODUCT');
    expect(resolveItemCategory('prod_123', 'PRODUCT')).toBe('PRODUCT');
  });

  it('productId null/undefined → renvoie le fallback', () => {
    expect(resolveItemCategory(null, 'BOARDING')).toBe('BOARDING');
    expect(resolveItemCategory(undefined, 'PET_TAXI')).toBe('PET_TAXI');
    expect(resolveItemCategory(null, 'GROOMING')).toBe('GROOMING');
  });

  it('productId vide string → fallback (sécurité — string vide ≠ id valide)', () => {
    expect(resolveItemCategory('', 'BOARDING')).toBe('BOARDING');
  });
});

// ===========================================================================
// Sémantique A — gate `isInvoiceClosedInMonth`
// ===========================================================================
describe('isInvoiceClosedInMonth — gate sémantique A', () => {
  it('false si aucun payment', () => {
    expect(
      isInvoiceClosedInMonth([], [mkItem('BOARDING', 100)], MAY_START, MAY_END),
    ).toBe(false);
  });

  it('false si aucun item', () => {
    expect(
      isInvoiceClosedInMonth([mkPayment(100, '2026-05-10')], [], MAY_START, MAY_END),
    ).toBe(false);
  });

  it('false si totalPaid < invoiceTotal (partial)', () => {
    expect(
      isInvoiceClosedInMonth(
        [mkPayment(500, '2026-05-10')],
        [mkItem('BOARDING', 1000)],
        MAY_START,
        MAY_END,
      ),
    ).toBe(false);
  });

  it('true à la tolérance 1 centime (DECIMAL(10,2) rounding)', () => {
    expect(
      isInvoiceClosedInMonth(
        [mkPayment(999.99, '2026-05-10')],
        [mkItem('BOARDING', 1000)],
        MAY_START,
        MAY_END,
      ),
    ).toBe(true);
  });

  it('false à -2 centimes (au-delà de la tolérance)', () => {
    expect(
      isInvoiceClosedInMonth(
        [mkPayment(999.98, '2026-05-10')],
        [mkItem('BOARDING', 1000)],
        MAY_START,
        MAY_END,
      ),
    ).toBe(false);
  });

  it('false si fully paid mais dernier payment hors mois', () => {
    expect(
      isInvoiceClosedInMonth(
        [mkPayment(500, '2026-04-29'), mkPayment(500, '2026-06-02')],
        [mkItem('BOARDING', 1000)],
        MAY_START,
        MAY_END,
      ),
    ).toBe(false);
  });

  it('true si dernier payment exactement à minuit le 1er du mois', () => {
    expect(
      isInvoiceClosedInMonth(
        [mkPayment(1000, '2026-05-01T00:00:00.000Z')],
        [mkItem('BOARDING', 1000)],
        MAY_START,
        MAY_END,
      ),
    ).toBe(true);
  });
});

// ===========================================================================
// Sémantique A — encaissé par catégorie sur un mois cible
// ===========================================================================
describe('Sémantique A — computeMonthlyRevenueByCategory', () => {
  it('Paul — facture clôturée mai → 360 boarding en mai, 0 ailleurs', () => {
    const result = computeMonthlyRevenueByCategory(
      [mkPayment(360, '2026-05-10')],
      [mkItem('BOARDING', 360)],
      MAY_START,
      MAY_END,
    );
    expect(result.boarding).toBe(360);
    expect(result.taxi).toBe(0);
  });

  it('Hasnaa — acompte partiel 240/720 en mai → 0 partout (gate fail)', () => {
    const result = computeMonthlyRevenueByCategory(
      [mkPayment(240, '2026-05-15')],
      [mkItem('BOARDING', 720)],
      MAY_START,
      MAY_END,
    );
    // PARTIALLY_PAID est exclu de la ventilation par catégorie tant qu'il
    // n'est pas clos. Le brut encaissé (240) reste visible via
    // computeMonthlyRevenue / volumeByCategory — pas via ce breakdown.
    expect(result.boarding).toBe(0);
  });

  it('Benjamin — multi-items réglés en un payment de mai → tout en mai', () => {
    const result = computeMonthlyRevenueByCategory(
      [mkPayment(1800, '2026-05-04')],
      [mkItem('BOARDING', 1650), mkItem('PET_TAXI', 150)],
      MAY_START,
      MAY_END,
    );
    expect(result.boarding).toBe(1650);
    expect(result.taxi).toBe(150);
    // Note vs ancien algo : identique pour ce cas (1 seul payment, mois target).
  });

  it('Alexandra — acompte avril + solde mai → TOUT en mai (mois du dernier payment)', () => {
    // Sémantique A : la facture bascule sur le mois où elle est clôturée.
    // L'acompte d'avril n'apparaît PAS dans le breakdown d'avril.
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

    const april = computeMonthlyRevenueByCategory(payments, items, APRIL_START, APRIL_END);
    expect(april.boarding).toBe(0);
    expect(april.taxi).toBe(0);
    expect(april.croquettes).toBe(0);
  });

  it('Long séjour avril-mai payé en juin → 0 partout en avril et mai', () => {
    const payments = [mkPayment(2000, '2026-06-03')];
    const items = [mkItem('BOARDING', 2000)];
    const april = computeMonthlyRevenueByCategory(payments, items, APRIL_START, APRIL_END);
    const may = computeMonthlyRevenueByCategory(payments, items, MAY_START, MAY_END);
    expect(april.boarding).toBe(0);
    expect(may.boarding).toBe(0);
  });
});

// ===========================================================================
// Régression DU-2026-0030 (Kabbaj Rita) — cas canonique sémantique A
// ===========================================================================
describe('Régression Rita DU-2026-0030 — sémantique A', () => {
  // Données réelles prod (voir docs/REVENUE_ATTRIBUTION_DECISION.md).
  // Le bug original : ancien algo FIFO attribuait 40 MAD à Toilettage en mai
  // (= reliquat du payment de mai après que le payment d'avril ait consommé
  //  toute la Pension + 60 MAD de Toilettage), alors que le Toilettage avait
  //  été intégralement payé.
  // Sémantique A corrige : la facture bascule en mai (mois du dernier
  // payment), TOUS les items à 100% — Toilettage = 100 (pas 40, pas 4.26).
  const ritaPayments = [
    mkPayment(900, '2026-04-29'),  // acompte au dépôt
    mkPayment(40, '2026-05-06'),   // solde au retrait
  ];
  const ritaItems = [
    // Pension Mamy — stockée en DB avec category='OTHER' mais description
    // contient "Pension" → inférée comme BOARDING via `bucketOf` / categoryKey.
    mkItem('OTHER', 840, 'Pension Mamy (chien)'),
    mkItem('GROOMING', 100, 'Toilettage Mamy (petit)'),
  ];

  it('mai : Pension 840 + Toilettage 100 (PAS 40 — fix du bug original)', () => {
    const may = computeMonthlyRevenueByCategory(
      ritaPayments,
      ritaItems,
      MAY_START,
      MAY_END,
    );
    expect(may.boarding).toBe(840);
    expect(may.grooming).toBe(100);
    expect(may.taxi).toBe(0);
    expect(may.croquettes).toBe(0);
    expect(may.other).toBe(0);
  });

  it('avril : 0 partout (acompte ne bascule plus rien en avril)', () => {
    const april = computeMonthlyRevenueByCategory(
      ritaPayments,
      ritaItems,
      APRIL_START,
      APRIL_END,
    );
    expect(april.boarding).toBe(0);
    expect(april.grooming).toBe(0);
  });

  it('totaux annuels : Σ(avril, mai) = invoice.amount (conservation)', () => {
    const april = computeMonthlyRevenueByCategory(ritaPayments, ritaItems, APRIL_START, APRIL_END);
    const may = computeMonthlyRevenueByCategory(ritaPayments, ritaItems, MAY_START, MAY_END);
    const totalApril = april.boarding + april.taxi + april.grooming + april.croquettes + april.other;
    const totalMay = may.boarding + may.taxi + may.grooming + may.croquettes + may.other;
    expect(totalApril + totalMay).toBe(940);
  });

  it('allocateBetweenItems mai : chaque item à 100% de son total, tagué 2026-05-06', () => {
    const alloc = allocateBetweenItems(ritaPayments, ritaItems, MAY_START, MAY_END);
    expect(alloc).toHaveLength(2);
    expect(alloc[0].amount.toNumber()).toBe(840);
    expect(alloc[0].lastPaidAt?.toISOString()).toBe('2026-05-06T00:00:00.000Z');
    expect(alloc[1].amount.toNumber()).toBe(100);
    expect(alloc[1].lastPaidAt?.toISOString()).toBe('2026-05-06T00:00:00.000Z');
  });

  it('allocateBetweenItems avril : tout à 0, lastPaidAt null', () => {
    const alloc = allocateBetweenItems(ritaPayments, ritaItems, APRIL_START, APRIL_END);
    expect(alloc[0].amount.toNumber()).toBe(0);
    expect(alloc[0].lastPaidAt).toBeNull();
    expect(alloc[1].amount.toNumber()).toBe(0);
  });
});

// ===========================================================================
// Catégorisation produit — productId force PRODUCT
// ===========================================================================
describe('Catégorisation produits', () => {
  it('Item Nexgard avec productId → category PRODUCT (jamais OTHER)', () => {
    const cat = resolveItemCategory('prod_nexgard_xs', 'OTHER');
    expect(cat).toBe('PRODUCT');
  });

  it('Item "Toilettage complet" sans productId → GROOMING via fallback', () => {
    const cat = resolveItemCategory(null, 'GROOMING');
    expect(cat).toBe('GROOMING');
  });
});
