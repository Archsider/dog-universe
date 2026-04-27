import { describe, it, expect, vi } from 'vitest';

// Mocks necessaires — payments.ts importe prisma, utils et loyalty.
// On teste exclusivement les fonctions pures extraites.
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/utils', () => ({ formatMAD: (n: number) => `${n} MAD` }));
vi.mock('@/lib/loyalty', () => ({ calculateSuggestedGrade: vi.fn() }));

import {
  computeItemAllocation,
  deriveInvoiceStatus,
  getItemAllocationPriority,
  type AllocationItem,
} from '../payments';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const mkItem = (id: string, description: string, total: number): AllocationItem =>
  ({ id, description, total });

const pension    = (id: string, total: number) => mkItem(id, 'Pension Max (chien)', total);
const taxiAller  = (id: string, total: number) => mkItem(id, 'Pet Taxi — Aller', total);
const taxiRetour = (id: string, total: number) => mkItem(id, 'Pet Taxi — Retour', total);
const other      = (id: string, total: number) => mkItem(id, 'Toilettage', total);

// ---------------------------------------------------------------------------
// getItemAllocationPriority — ordre de priorite FIFO
// ---------------------------------------------------------------------------
describe('getItemAllocationPriority', () => {
  it('Taxi Aller est prioritaire (priorite 0)', () => {
    expect(getItemAllocationPriority('Pet Taxi — Aller')).toBe(0);
  });

  it('Pension est second (priorite 1)', () => {
    expect(getItemAllocationPriority('Pension Max (chien)')).toBe(1);
  });

  it('Boarding (EN) est second (priorite 1)', () => {
    expect(getItemAllocationPriority('Boarding Max (dog)')).toBe(1);
  });

  it('Nuit est classe en priorite 1', () => {
    expect(getItemAllocationPriority('10 nuits pension')).toBe(1);
  });

  it('Taxi Retour est troisieme (priorite 2)', () => {
    expect(getItemAllocationPriority('Pet Taxi — Retour')).toBe(2);
  });

  it('Toilettage est derniere priorite (3)', () => {
    expect(getItemAllocationPriority('Toilettage Rex (grand)')).toBe(3);
  });

  it('Description inconnue — priorite 3 par defaut', () => {
    expect(getItemAllocationPriority('Croquettes premium')).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// computeItemAllocation — 1 item
// ---------------------------------------------------------------------------
describe('computeItemAllocation — 1 item', () => {
  it('paiement exact — item PAID, allocatedAmount egal au total', () => {
    const [r] = computeItemAllocation([pension('i1', 1200)], 1200);
    expect(r.status).toBe('PAID');
    expect(r.allocatedAmount).toBe(1200);
  });

  it('paiement partiel — item PARTIAL, montant alloue correct', () => {
    const [r] = computeItemAllocation([pension('i1', 1200)], 500);
    expect(r.status).toBe('PARTIAL');
    expect(r.allocatedAmount).toBe(500);
  });

  it('paiement nul — item PENDING, allocatedAmount = 0', () => {
    const [r] = computeItemAllocation([pension('i1', 1200)], 0);
    expect(r.status).toBe('PENDING');
    expect(r.allocatedAmount).toBe(0);
  });

  it('surpaiement — item PAID, allocatedAmount plafonne au total de item', () => {
    const [r] = computeItemAllocation([pension('i1', 1200)], 9999);
    expect(r.status).toBe('PAID');
    expect(r.allocatedAmount).toBe(1200);
  });
});

// ---------------------------------------------------------------------------
// computeItemAllocation — plusieurs items
// ---------------------------------------------------------------------------
describe('computeItemAllocation — plusieurs items', () => {
  it('paiement couvrant exactement tous les items — tous PAID', () => {
    const items = [pension('i1', 600), pension('i2', 400), other('i3', 100)];
    const results = computeItemAllocation(items, 1100);
    results.forEach(r => expect(r.status).toBe('PAID'));
  });

  it('paiement couvrant 2 items sur 3 — PAID, PAID, PENDING', () => {
    const items = [pension('i1', 600), pension('i2', 400), other('i3', 200)];
    const results = computeItemAllocation(items, 1000);
    const byId = Object.fromEntries(results.map(r => [r.id, r]));
    expect(byId['i1'].status).toBe('PAID');
    expect(byId['i2'].status).toBe('PAID');
    expect(byId['i3'].status).toBe('PENDING');
    expect(byId['i3'].allocatedAmount).toBe(0);
  });

  it('paiement partiel sur premier item — reste a zero pour les suivants', () => {
    const items = [pension('i1', 1000), other('i2', 500)];
    const results = computeItemAllocation(items, 300);
    const byId = Object.fromEntries(results.map(r => [r.id, r]));
    expect(byId['i1'].status).toBe('PARTIAL');
    expect(byId['i1'].allocatedAmount).toBe(300);
    expect(byId['i2'].status).toBe('PENDING');
    expect(byId['i2'].allocatedAmount).toBe(0);
  });

  it('facture 5 items — paiement exact total — tous PAID', () => {
    const items = [
      pension('i1', 500), pension('i2', 500),
      taxiAller('i3', 150), taxiRetour('i4', 150), other('i5', 100),
    ];
    const total = items.reduce((s, i) => s + i.total, 0);
    const results = computeItemAllocation(items, total);
    results.forEach(r => expect(r.status).toBe('PAID'));
  });

  it('item deja couvert + paiement partiel sur item suivant', () => {
    const items = [pension('i1', 700), other('i2', 300)];
    const results = computeItemAllocation(items, 850);
    const byId = Object.fromEntries(results.map(r => [r.id, r]));
    expect(byId['i1'].status).toBe('PAID');
    expect(byId['i1'].allocatedAmount).toBe(700);
    expect(byId['i2'].status).toBe('PARTIAL');
    expect(byId['i2'].allocatedAmount).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// computeItemAllocation — ordre FIFO par priorite
// ---------------------------------------------------------------------------
describe('computeItemAllocation — ordre allocation FIFO par priorite', () => {
  it('taxi aller paye avant la pension meme si insere apres', () => {
    const items = [pension('p', 1200), taxiAller('t', 150)];
    const results = computeItemAllocation(items, 150);
    const byId = Object.fromEntries(results.map(r => [r.id, r]));
    expect(byId['t'].status).toBe('PAID');
    expect(byId['p'].status).toBe('PENDING');
  });

  it('ordre complet — taxi aller, pension, taxi retour, autres', () => {
    const items = [
      other('g', 100),
      taxiRetour('tr', 150),
      pension('p', 600),
      taxiAller('ta', 150),
    ];
    const results = computeItemAllocation(items, 750);
    const byId = Object.fromEntries(results.map(r => [r.id, r]));
    expect(byId['ta'].status).toBe('PAID');    // priorite 0
    expect(byId['p'].status).toBe('PAID');     // priorite 1
    expect(byId['tr'].status).toBe('PENDING'); // priorite 2 — budget epuise
    expect(byId['g'].status).toBe('PENDING');  // priorite 3
  });

  it('facture 1 item — comportement identique au cas multi-items', () => {
    const results = computeItemAllocation([pension('solo', 300)], 300);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('PAID');
  });
});

// ---------------------------------------------------------------------------
// computeItemAllocation — cas limites
// ---------------------------------------------------------------------------
describe('computeItemAllocation — cas limites', () => {
  it('liste vide — resultat vide', () => {
    expect(computeItemAllocation([], 500)).toHaveLength(0);
  });

  it('montant 0 — tous les items en PENDING', () => {
    const items = [pension('i1', 500), other('i2', 200)];
    computeItemAllocation(items, 0).forEach(r => {
      expect(r.status).toBe('PENDING');
      expect(r.allocatedAmount).toBe(0);
    });
  });

  it('somme des allocations ne depasse pas totalPaid', () => {
    const items = [pension('i1', 300), other('i2', 200), taxiAller('i3', 150)];
    const totalPaid = 400;
    const results = computeItemAllocation(items, totalPaid);
    const sumAllocated = results.reduce((s, r) => s + r.allocatedAmount, 0);
    expect(sumAllocated).toBeLessThanOrEqual(totalPaid);
  });

  it('aucun allocatedAmount negatif', () => {
    const items = [pension('i1', 500), other('i2', 300)];
    computeItemAllocation(items, 100).forEach(r => {
      expect(r.allocatedAmount).toBeGreaterThanOrEqual(0);
    });
  });
});

// ---------------------------------------------------------------------------
// deriveInvoiceStatus
// ---------------------------------------------------------------------------
describe('deriveInvoiceStatus', () => {
  it('0 MAD paye — statut PENDING', () => {
    expect(deriveInvoiceStatus(0, 1000)).toBe('PENDING');
  });

  it('montant negatif — statut PENDING', () => {
    expect(deriveInvoiceStatus(-50, 1000)).toBe('PENDING');
  });

  it('paiement partiel — statut PARTIALLY_PAID', () => {
    expect(deriveInvoiceStatus(500, 1000)).toBe('PARTIALLY_PAID');
  });

  it('1 MAD paye sur 1000 — statut PARTIALLY_PAID', () => {
    expect(deriveInvoiceStatus(1, 1000)).toBe('PARTIALLY_PAID');
  });

  it('paiement exact — statut PAID', () => {
    expect(deriveInvoiceStatus(1000, 1000)).toBe('PAID');
  });

  it('surpaiement — statut PAID', () => {
    expect(deriveInvoiceStatus(1500, 1000)).toBe('PAID');
  });
});
