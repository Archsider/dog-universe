import { describe, it, expect, vi } from 'vitest';

// Mock prisma — pricing.ts importe le module mais getPricingSettings() est
// la seule fonction qui utilise prisma. Les fonctions testees ici sont pures.
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  calculateBoardingBreakdown,
  calculateTaxiPrice,
  calculateBoardingTotalForExtension,
  PRICING_DEFAULTS,
  type PetForPricing,
  type PricingSettings,
} from '../pricing';

const P: PricingSettings = { ...PRICING_DEFAULTS };

const dog = (name = 'Max'): PetForPricing => ({ id: name, name, species: 'DOG' });
const cat = (name = 'Milo'): PetForPricing => ({ id: name, name, species: 'CAT' });

// ---------------------------------------------------------------------------
// calculateBoardingBreakdown — pension chien seul
// ---------------------------------------------------------------------------
describe('calculateBoardingBreakdown — pension chien seul', () => {
  it('1 chien, 10 nuits (sous seuil 32) — tarif standard 120 MAD/nuit', () => {
    const result = calculateBoardingBreakdown(10, [dog()], undefined, false, false, P);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].unitPrice).toBe(120);
    expect(result.items[0].total).toBe(1200);
    expect(result.total).toBe(1200);
  });

  it('1 chien, exactement 32 nuits — tarif standard (seuil non depasse)', () => {
    const result = calculateBoardingBreakdown(32, [dog()], undefined, false, false, P);
    expect(result.items[0].unitPrice).toBe(120);
    expect(result.total).toBe(3840);
  });

  it('1 chien, 33 nuits (depasse seuil 32) — tarif long sejour 100 MAD/nuit', () => {
    const result = calculateBoardingBreakdown(33, [dog()], undefined, false, false, P);
    expect(result.items[0].unitPrice).toBe(100);
    expect(result.total).toBe(3300);
  });

  it('1 chien, 50 nuits — tarif degressif 100 MAD/nuit', () => {
    const result = calculateBoardingBreakdown(50, [dog()], undefined, false, false, P);
    expect(result.items[0].unitPrice).toBe(100);
    expect(result.total).toBe(5000);
  });

  it('tarif standard personnalise via pricing settings', () => {
    const custom: PricingSettings = { ...P, boarding_dog_per_night: 130 };
    const result = calculateBoardingBreakdown(5, [dog()], undefined, false, false, custom);
    expect(result.items[0].unitPrice).toBe(130);
    expect(result.total).toBe(650);
  });
});

// ---------------------------------------------------------------------------
// calculateBoardingBreakdown — plusieurs chiens
// ---------------------------------------------------------------------------
describe('calculateBoardingBreakdown — plusieurs chiens', () => {
  it('2 chiens, 10 nuits — tarif groupe 100 MAD/chien/nuit', () => {
    const result = calculateBoardingBreakdown(10, [dog('Max'), dog('Luna')], undefined, false, false, P);
    expect(result.items).toHaveLength(2);
    result.items.forEach(item => {
      expect(item.unitPrice).toBe(100);
      expect(item.total).toBe(1000);
    });
    expect(result.total).toBe(2000);
  });

  it('3 chiens, 5 nuits — 3 lignes, 100 MAD x 5 chacune', () => {
    const result = calculateBoardingBreakdown(5, [dog('A'), dog('B'), dog('C')], undefined, false, false, P);
    expect(result.items).toHaveLength(3);
    expect(result.total).toBe(1500);
  });

  it('tarif groupe ne depend pas du seuil long sejour', () => {
    const result = calculateBoardingBreakdown(40, [dog('A'), dog('B')], undefined, false, false, P);
    result.items.forEach(item => expect(item.unitPrice).toBe(100));
    expect(result.total).toBe(8000);
  });
});

// ---------------------------------------------------------------------------
// calculateBoardingBreakdown — chat
// ---------------------------------------------------------------------------
describe('calculateBoardingBreakdown — chat', () => {
  it('1 chat, 7 nuits — 70 MAD/nuit', () => {
    const result = calculateBoardingBreakdown(7, [cat()], undefined, false, false, P);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].unitPrice).toBe(70);
    expect(result.total).toBe(490);
  });

  it('tarif chat inchange meme au-dela de 32 nuits', () => {
    const result = calculateBoardingBreakdown(40, [cat()], undefined, false, false, P);
    expect(result.items[0].unitPrice).toBe(70);
    expect(result.total).toBe(2800);
  });

  it('2 chats, 5 nuits — 2 lignes separees, 70 MAD chacune', () => {
    const result = calculateBoardingBreakdown(5, [cat('Milo'), cat('Nala')], undefined, false, false, P);
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(700);
  });
});

// ---------------------------------------------------------------------------
// calculateBoardingBreakdown — toilettage (grooming)
// ---------------------------------------------------------------------------
describe('calculateBoardingBreakdown — toilettage', () => {
  it('grooming SMALL (petit chien) — +100 MAD', () => {
    const result = calculateBoardingBreakdown(5, [dog('Max')], { Max: 'SMALL' }, false, false, P);
    const groomItem = result.items.find(i => i.descriptionFr.includes('Toilettage'));
    expect(groomItem).toBeDefined();
    expect(groomItem!.unitPrice).toBe(100);
    expect(result.total).toBe(5 * 120 + 100);
  });

  it('grooming LARGE (grand chien) — +150 MAD', () => {
    const result = calculateBoardingBreakdown(5, [dog('Rex')], { Rex: 'LARGE' }, false, false, P);
    const groomItem = result.items.find(i => i.descriptionFr.includes('Toilettage'));
    expect(groomItem!.unitPrice).toBe(150);
    expect(result.total).toBe(5 * 120 + 150);
  });

  it('grooming absent si id chien non present dans groomingMap', () => {
    const result = calculateBoardingBreakdown(5, [dog('Max')], { Autre: 'SMALL' }, false, false, P);
    const groomItem = result.items.find(i => i.descriptionFr.includes('Toilettage'));
    expect(groomItem).toBeUndefined();
  });

  it('grooming non applique aux chats', () => {
    const milo = cat('Milo');
    const result = calculateBoardingBreakdown(5, [milo], { Milo: 'SMALL' }, false, false, P);
    const groomItem = result.items.find(i => i.descriptionFr.includes('Toilettage'));
    expect(groomItem).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// calculateBoardingBreakdown — taxi addon
// ---------------------------------------------------------------------------
describe('calculateBoardingBreakdown — taxi addon', () => {
  it('taxi aller seul — +150 MAD', () => {
    const result = calculateBoardingBreakdown(3, [dog()], undefined, true, false, P);
    const taxiItem = result.items.find(i => i.descriptionFr.includes('Aller'));
    expect(taxiItem).toBeDefined();
    expect(taxiItem!.total).toBe(150);
    expect(result.total).toBe(3 * 120 + 150);
  });

  it('taxi retour seul — +150 MAD', () => {
    const result = calculateBoardingBreakdown(3, [dog()], undefined, false, true, P);
    const taxiItem = result.items.find(i => i.descriptionFr.includes('Retour'));
    expect(taxiItem).toBeDefined();
    expect(result.total).toBe(3 * 120 + 150);
  });

  it('taxi aller + retour — +300 MAD total', () => {
    const result = calculateBoardingBreakdown(3, [dog()], undefined, true, true, P);
    expect(result.total).toBe(3 * 120 + 300);
    const taxiItems = result.items.filter(i => i.descriptionFr.includes('Taxi'));
    expect(taxiItems).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// calculateBoardingBreakdown — combinaisons et cas limites
// ---------------------------------------------------------------------------
describe('calculateBoardingBreakdown — combinaisons et cas limites', () => {
  it('1 chien + 1 chat, 5 nuits — total correct', () => {
    const result = calculateBoardingBreakdown(5, [dog(), cat()], undefined, false, false, P);
    expect(result.total).toBe(5 * 120 + 5 * 70);
  });

  it('0 nuits — tous les totaux sont 0', () => {
    const result = calculateBoardingBreakdown(0, [dog()], undefined, false, false, P);
    expect(result.total).toBe(0);
    result.items.forEach(item => expect(item.total).toBe(0));
  });

  it('liste de pets vide — total 0, aucun item pension', () => {
    const result = calculateBoardingBreakdown(5, [], undefined, false, false, P);
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('total egal a la somme de tous les items', () => {
    const result = calculateBoardingBreakdown(
      10, [dog('A'), dog('B'), cat()], { A: 'SMALL' }, true, true, P,
    );
    const sumItems = result.items.reduce((s, i) => s + i.total, 0);
    expect(result.total).toBe(sumItems);
  });

  it('aucun prix ne peut etre negatif', () => {
    const result = calculateBoardingBreakdown(15, [dog(), cat()], { Max: 'LARGE' }, true, true, P);
    result.items.forEach(item => {
      expect(item.unitPrice).toBeGreaterThanOrEqual(0);
      expect(item.total).toBeGreaterThanOrEqual(0);
    });
    expect(result.total).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// calculateTaxiPrice
// ---------------------------------------------------------------------------
describe('calculateTaxiPrice', () => {
  it('Pet Taxi STANDARD — 150 MAD', () => {
    const result = calculateTaxiPrice('STANDARD', P);
    expect(result.total).toBe(150);
    expect(result.items[0].unitPrice).toBe(150);
    expect(result.items[0].quantity).toBe(1);
  });

  it('Pet Taxi VET — 300 MAD', () => {
    expect(calculateTaxiPrice('VET', P).total).toBe(300);
  });

  it('Pet Taxi AIRPORT — 300 MAD', () => {
    expect(calculateTaxiPrice('AIRPORT', P).total).toBe(300);
  });

  it('libelle FR correct pour STANDARD', () => {
    const result = calculateTaxiPrice('STANDARD', P);
    expect(result.items[0].descriptionFr.toLowerCase()).toContain('standard');
  });

  it('libelle FR correct pour VET', () => {
    const result = calculateTaxiPrice('VET', P);
    expect(result.items[0].descriptionFr.toLowerCase()).toContain('rinaire');
  });

  it('libelle FR correct pour AIRPORT', () => {
    const result = calculateTaxiPrice('AIRPORT', P);
    expect(result.items[0].descriptionFr.toLowerCase()).toContain('roport');
  });

  it('pricing settings personnalises — prix custom', () => {
    const custom: PricingSettings = { ...P, taxi_standard: 200, taxi_vet: 400, taxi_airport: 500 };
    expect(calculateTaxiPrice('STANDARD', custom).total).toBe(200);
    expect(calculateTaxiPrice('VET', custom).total).toBe(400);
    expect(calculateTaxiPrice('AIRPORT', custom).total).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// calculateBoardingTotalForExtension
// ---------------------------------------------------------------------------
describe('calculateBoardingTotalForExtension', () => {
  it('1 chien, 10 nuits, sans grooming ni taxi — total nuits seul', () => {
    const total = calculateBoardingTotalForExtension([{ species: 'DOG' }], 10, 0, 0, P);
    expect(total).toBe(10 * 120);
  });

  it('1 chien, 10 nuits, grooming 100 MAD, taxi 150 MAD — somme correcte', () => {
    const total = calculateBoardingTotalForExtension([{ species: 'DOG' }], 10, 100, 150, P);
    expect(total).toBe(10 * 120 + 100 + 150);
  });

  it('extension au-dela du seuil long sejour — tarif degressif applique', () => {
    const total = calculateBoardingTotalForExtension([{ species: 'DOG' }], 40, 0, 0, P);
    expect(total).toBe(40 * 100);
  });

  it('2 chiens en extension — tarif multi-chiens applique', () => {
    const total = calculateBoardingTotalForExtension(
      [{ species: 'DOG' }, { species: 'DOG' }], 5, 0, 0, P,
    );
    expect(total).toBe(5 * 100 * 2);
  });

  it('1 chat en extension — tarif chat correct', () => {
    const total = calculateBoardingTotalForExtension([{ species: 'CAT' }], 7, 0, 0, P);
    expect(total).toBe(7 * 70);
  });
});
