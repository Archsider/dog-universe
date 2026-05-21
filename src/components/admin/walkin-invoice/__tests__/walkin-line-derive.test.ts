import { describe, it, expect } from 'vitest';
import { deriveWalkinLine, isServiceCategory, WALKIN_GROOMING_PRICES, WALKIN_TAXI_PRICES } from '../walkin-line-derive';

describe('deriveWalkinLine', () => {
  it('BOARDING cat: 70/night, quantity = nights', () => {
    const r = deriveWalkinLine('BOARDING', { species: 'CAT', petName: 'Mimi', nights: 3 });
    expect(r).not.toBeNull();
    expect(r!.unitPrice).toBe(70);
    expect(r!.quantity).toBe(3);
    expect(r!.description).toContain('Mimi');
    expect(r!.description).toContain('chat');
    expect(r!.description).toContain('3 nuits');
  });

  it('BOARDING single dog short stay: 120/night', () => {
    const r = deriveWalkinLine('BOARDING', { species: 'DOG', nights: 2 });
    expect(r!.unitPrice).toBe(120);
    expect(r!.quantity).toBe(2);
  });

  it('BOARDING dog long stay (>=32 nights): 100/night', () => {
    const r = deriveWalkinLine('BOARDING', { species: 'DOG', nights: 40 });
    expect(r!.unitPrice).toBe(100);
    expect(r!.quantity).toBe(40);
  });

  it('BOARDING defaults nights to 1 and floors fractional', () => {
    const r = deriveWalkinLine('BOARDING', { species: 'CAT' });
    expect(r!.quantity).toBe(1);
    const r2 = deriveWalkinLine('BOARDING', { species: 'CAT', nights: 2.9 });
    expect(r2!.quantity).toBe(2);
  });

  it('BOARDING without species returns null (cannot price)', () => {
    expect(deriveWalkinLine('BOARDING', { nights: 3 })).toBeNull();
  });

  it('BOARDING per-month: quantity = months, unitPrice null (manual), desc says mois', () => {
    const r = deriveWalkinLine('BOARDING', { species: 'DOG', petName: 'Rex', nights: 2, billingUnit: 'MONTH' });
    expect(r).not.toBeNull();
    expect(r!.quantity).toBe(2);
    expect(r!.unitPrice).toBeNull();
    expect(r!.description).toContain('Rex');
    expect(r!.description).toContain('2 mois');
  });

  it('BOARDING explicit NIGHT unit behaves like default', () => {
    const r = deriveWalkinLine('BOARDING', { species: 'CAT', nights: 3, billingUnit: 'NIGHT' });
    expect(r!.unitPrice).toBe(70);
    expect(r!.quantity).toBe(3);
  });

  it('GROOMING small/large prices', () => {
    expect(deriveWalkinLine('GROOMING', { groomingSize: 'SMALL' })!.unitPrice).toBe(WALKIN_GROOMING_PRICES.SMALL);
    expect(deriveWalkinLine('GROOMING', { groomingSize: 'LARGE', petName: 'Rex' })!.unitPrice).toBe(WALKIN_GROOMING_PRICES.LARGE);
    expect(deriveWalkinLine('GROOMING', { groomingSize: 'LARGE', petName: 'Rex' })!.description).toContain('Rex');
  });

  it('PET_TAXI trip types', () => {
    expect(deriveWalkinLine('PET_TAXI', { taxiType: 'STANDARD' })!.unitPrice).toBe(WALKIN_TAXI_PRICES.STANDARD);
    expect(deriveWalkinLine('PET_TAXI', { taxiType: 'AIRPORT' })!.unitPrice).toBe(WALKIN_TAXI_PRICES.AIRPORT);
    expect(deriveWalkinLine('PET_TAXI', { taxiType: 'VET' })!.quantity).toBe(1);
  });

  it('PRODUCT / OTHER / DISCOUNT are not derivable (manual entry)', () => {
    expect(deriveWalkinLine('PRODUCT', {})).toBeNull();
    expect(deriveWalkinLine('OTHER', {})).toBeNull();
    expect(deriveWalkinLine('DISCOUNT', {})).toBeNull();
  });

  it('English locale labels', () => {
    const r = deriveWalkinLine('BOARDING', { species: 'DOG', nights: 1 }, 'en');
    expect(r!.description).toContain('Boarding');
    expect(r!.description).toContain('night');
  });

  it('isServiceCategory', () => {
    expect(isServiceCategory('BOARDING')).toBe(true);
    expect(isServiceCategory('GROOMING')).toBe(true);
    expect(isServiceCategory('PET_TAXI')).toBe(true);
    expect(isServiceCategory('PRODUCT')).toBe(false);
    expect(isServiceCategory('OTHER')).toBe(false);
    expect(isServiceCategory('DISCOUNT')).toBe(false);
  });
});
