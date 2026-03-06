import { describe, it, expect } from 'vitest';
import {
  calculateBoardingBreakdown,
  calculateTaxiPrice,
  getGroomingPriceForPet,
} from '../pricing';
import type { PetForPricing, PricingSettings } from '../pricing';

const dog = (id = 'd1', name = 'Max'): PetForPricing => ({ id, name, species: 'DOG' });
const cat = (id = 'c1', name = 'Luna'): PetForPricing => ({ id, name, species: 'CAT' });

const customPricing: PricingSettings = {
  boarding_dog_per_night: 200,
  boarding_cat_per_night: 90,
  boarding_dog_long_stay: 160,
  boarding_dog_multi: 180,
  long_stay_threshold: 20,
  grooming_small_dog: 120,
  grooming_large_dog: 200,
  taxi_standard: 180,
  taxi_vet: 350,
  taxi_airport: 350,
};

// ────────────────────────────────────────────────────────────────
// calculateBoardingBreakdown
// ────────────────────────────────────────────────────────────────
describe('calculateBoardingBreakdown', () => {
  describe('single dog — short stay (≤32 nights)', () => {
    it('bills at 120 MAD/night for exactly 32 nights', () => {
      const result = calculateBoardingBreakdown(32, [dog()]);
      expect(result.total).toBe(32 * 120);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].unitPrice).toBe(120);
    });

    it('bills at 120 MAD/night for 1 night', () => {
      const result = calculateBoardingBreakdown(1, [dog()]);
      expect(result.total).toBe(120);
    });
  });

  describe('single dog — long stay (>32 nights)', () => {
    it('bills at 100 MAD/night for 33 nights', () => {
      const result = calculateBoardingBreakdown(33, [dog()]);
      expect(result.total).toBe(33 * 100);
      expect(result.items[0].unitPrice).toBe(100);
    });

    it('bills at 100 MAD/night for 60 nights', () => {
      const result = calculateBoardingBreakdown(60, [dog()]);
      expect(result.total).toBe(60 * 100);
    });
  });

  describe('multi-dog (2+)', () => {
    it('bills 2 dogs at 100 MAD/dog/night regardless of duration', () => {
      const result = calculateBoardingBreakdown(5, [dog('d1', 'Max'), dog('d2', 'Rex')]);
      expect(result.total).toBe(2 * 5 * 100);
      expect(result.items).toHaveLength(2);
      result.items.forEach(item => expect(item.unitPrice).toBe(100));
    });

    it('bills 3 dogs correctly', () => {
      const result = calculateBoardingBreakdown(
        10,
        [dog('d1', 'A'), dog('d2', 'B'), dog('d3', 'C')],
      );
      expect(result.total).toBe(3 * 10 * 100);
    });
  });

  describe('cats', () => {
    it('bills 1 cat at 70 MAD/night', () => {
      const result = calculateBoardingBreakdown(7, [cat()]);
      expect(result.total).toBe(7 * 70);
      expect(result.items[0].unitPrice).toBe(70);
    });

    it('bills 2 cats independently at 70 MAD each', () => {
      const result = calculateBoardingBreakdown(3, [cat('c1', 'L1'), cat('c2', 'L2')]);
      expect(result.total).toBe(2 * 3 * 70);
    });
  });

  describe('mixed species', () => {
    it('bills dog at multi-rate + cat when 1 dog + 1 cat', () => {
      // 1 dog alone → 120/night, but when mixed the dog is still solo → 120
      const result = calculateBoardingBreakdown(5, [dog(), cat()]);
      // 1 dog (solo) → 5*120 + 1 cat → 5*70 = 600+350 = 950
      expect(result.total).toBe(5 * 120 + 5 * 70);
    });

    it('bills 2 dogs at multi-rate + cat', () => {
      const result = calculateBoardingBreakdown(4, [dog('d1', 'A'), dog('d2', 'B'), cat()]);
      expect(result.total).toBe(2 * 4 * 100 + 4 * 70);
    });
  });

  describe('grooming add-on', () => {
    it('adds SMALL grooming price per dog', () => {
      const d = dog();
      const result = calculateBoardingBreakdown(5, [d], { [d.id]: 'SMALL' });
      expect(result.total).toBe(5 * 120 + 100);
      const groomItem = result.items.find(i => i.descriptionEn.startsWith('Grooming'));
      expect(groomItem?.total).toBe(100);
    });

    it('adds LARGE grooming price per dog', () => {
      const d = dog();
      const result = calculateBoardingBreakdown(5, [d], { [d.id]: 'LARGE' });
      expect(result.total).toBe(5 * 120 + 150);
    });

    it('does not add grooming to cats', () => {
      const c = cat();
      const result = calculateBoardingBreakdown(3, [c], { [c.id]: 'SMALL' });
      // cats are not dogs — grooming map only applies to dogs
      expect(result.total).toBe(3 * 70);
      expect(result.items).toHaveLength(1);
    });

    it('adds grooming for each dog in multi-dog scenario', () => {
      const d1 = dog('d1', 'Max');
      const d2 = dog('d2', 'Rex');
      const result = calculateBoardingBreakdown(
        3,
        [d1, d2],
        { [d1.id]: 'SMALL', [d2.id]: 'LARGE' },
      );
      expect(result.total).toBe(2 * 3 * 100 + 100 + 150);
    });
  });

  describe('taxi add-on', () => {
    it('adds taxi_standard for go only', () => {
      const result = calculateBoardingBreakdown(3, [dog()], undefined, true, false);
      expect(result.total).toBe(3 * 120 + 150);
    });

    it('adds taxi_standard for return only', () => {
      const result = calculateBoardingBreakdown(3, [dog()], undefined, false, true);
      expect(result.total).toBe(3 * 120 + 150);
    });

    it('adds 2× taxi_standard when both go and return enabled', () => {
      const result = calculateBoardingBreakdown(3, [dog()], undefined, true, true);
      expect(result.total).toBe(3 * 120 + 150 + 150);
    });
  });

  describe('custom pricing settings', () => {
    it('uses custom rates when provided', () => {
      const result = calculateBoardingBreakdown(5, [dog()], undefined, false, false, customPricing);
      // 5 nights ≤ 20 (custom threshold) → 200/night
      expect(result.total).toBe(5 * 200);
    });

    it('uses custom long-stay rate above custom threshold', () => {
      const result = calculateBoardingBreakdown(21, [dog()], undefined, false, false, customPricing);
      expect(result.total).toBe(21 * 160);
    });

    it('uses custom cat rate', () => {
      const result = calculateBoardingBreakdown(4, [cat()], undefined, false, false, customPricing);
      expect(result.total).toBe(4 * 90);
    });
  });

  describe('edge cases', () => {
    it('returns total=0 for empty pets list', () => {
      const result = calculateBoardingBreakdown(5, []);
      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    it('returns total=0 for 0 nights', () => {
      const result = calculateBoardingBreakdown(0, [dog()]);
      expect(result.total).toBe(0);
    });
  });
});

// ────────────────────────────────────────────────────────────────
// calculateTaxiPrice
// ────────────────────────────────────────────────────────────────
describe('calculateTaxiPrice', () => {
  it('STANDARD → 150 MAD', () => {
    const result = calculateTaxiPrice('STANDARD');
    expect(result.total).toBe(150);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].unitPrice).toBe(150);
  });

  it('VET → 300 MAD', () => {
    expect(calculateTaxiPrice('VET').total).toBe(300);
  });

  it('AIRPORT → 300 MAD', () => {
    expect(calculateTaxiPrice('AIRPORT').total).toBe(300);
  });

  it('uses custom pricing when provided', () => {
    expect(calculateTaxiPrice('STANDARD', customPricing).total).toBe(180);
    expect(calculateTaxiPrice('VET', customPricing).total).toBe(350);
    expect(calculateTaxiPrice('AIRPORT', customPricing).total).toBe(350);
  });

  it('includes correct French descriptions', () => {
    expect(calculateTaxiPrice('STANDARD').items[0].descriptionFr).toContain('standard');
    expect(calculateTaxiPrice('VET').items[0].descriptionFr).toContain('vétérinaire');
    expect(calculateTaxiPrice('AIRPORT').items[0].descriptionFr).toContain('aéroport');
  });
});

// ────────────────────────────────────────────────────────────────
// getGroomingPriceForPet
// ────────────────────────────────────────────────────────────────
describe('getGroomingPriceForPet', () => {
  it('SMALL → 100 MAD (default)', () => {
    expect(getGroomingPriceForPet('SMALL')).toBe(100);
  });

  it('LARGE → 150 MAD (default)', () => {
    expect(getGroomingPriceForPet('LARGE')).toBe(150);
  });

  it('uses custom pricing when provided', () => {
    expect(getGroomingPriceForPet('SMALL', customPricing)).toBe(120);
    expect(getGroomingPriceForPet('LARGE', customPricing)).toBe(200);
  });
});

// Default pricing is exercised implicitly in every test that omits
// the optional `pricing` parameter — no explicit PRICING_DEFAULTS
// test needed since it is not a public export.
