import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subMonths, subYears } from 'date-fns';

const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: { product: { findMany: findManyMock } },
}));

import {
  getAgeCategory,
  getMatchingProducts,
  ageCategoryLabelFr,
} from '../pet-profile';

beforeEach(() => {
  findManyMock.mockReset();
});

describe('getAgeCategory — détection auto', () => {
  it('Chiot 6 mois → PUPPY', () => {
    expect(getAgeCategory(subMonths(new Date(), 6), 'DOG')).toBe('PUPPY');
  });
  it('Chien 11 mois → PUPPY', () => {
    expect(getAgeCategory(subMonths(new Date(), 11), 'DOG')).toBe('PUPPY');
  });
  it('Chien 12 mois → JUNIOR', () => {
    expect(getAgeCategory(subMonths(new Date(), 12), 'DOG')).toBe('JUNIOR');
  });
  it('Chien 18 mois → JUNIOR', () => {
    expect(getAgeCategory(subMonths(new Date(), 18), 'DOG')).toBe('JUNIOR');
  });
  it('Chien 24 mois → ADULT', () => {
    expect(getAgeCategory(subMonths(new Date(), 24), 'DOG')).toBe('ADULT');
  });
  it('Chien 4 ans → ADULT', () => {
    expect(getAgeCategory(subYears(new Date(), 4), 'DOG')).toBe('ADULT');
  });
  it('Chien 7 ans (84 mois) → SENIOR', () => {
    expect(getAgeCategory(subMonths(new Date(), 84), 'DOG')).toBe('SENIOR');
  });
  it('Chien 8 ans → SENIOR', () => {
    expect(getAgeCategory(subYears(new Date(), 8), 'DOG')).toBe('SENIOR');
  });
  it('Chat 3 ans → ADULT', () => {
    expect(getAgeCategory(subYears(new Date(), 3), 'CAT')).toBe('ADULT');
  });
  it('Chat 10 ans → SENIOR', () => {
    expect(getAgeCategory(subYears(new Date(), 10), 'CAT')).toBe('SENIOR');
  });
  it('dateOfBirth null → ADULT par défaut', () => {
    expect(getAgeCategory(null, 'DOG')).toBe('ADULT');
    expect(getAgeCategory(null, 'CAT')).toBe('ADULT');
  });
});

describe('ageCategoryLabelFr', () => {
  it('PUPPY chien → Chiot', () => {
    expect(ageCategoryLabelFr('PUPPY', 'DOG')).toBe('Chiot');
  });
  it('PUPPY chat → Chaton', () => {
    expect(ageCategoryLabelFr('PUPPY', 'CAT')).toBe('Chaton');
  });
  it('SENIOR → Senior (7+)', () => {
    expect(ageCategoryLabelFr('SENIOR', 'DOG')).toBe('Senior (7+)');
  });
});

describe('getMatchingProducts — filtrage', () => {
  it('exclut stock=0 par défaut', async () => {
    findManyMock.mockResolvedValue([]);
    await getMatchingProducts([{ id: 'p1', species: 'DOG', dateOfBirth: subYears(new Date(), 4) }]);
    const args = findManyMock.mock.calls[0][0];
    expect(args.where).toMatchObject({ available: true, stock: { gt: 0 } });
  });

  it('inclut stock=0 quand includeOutOfStock=true', async () => {
    findManyMock.mockResolvedValue([]);
    await getMatchingProducts(
      [{ id: 'p1', species: 'DOG', dateOfBirth: subYears(new Date(), 4) }],
      { includeOutOfStock: true },
    );
    const args = findManyMock.mock.calls[0][0];
    expect(args.where.available).toBe(true);
    expect(args.where.stock).toBeUndefined();
  });

  it('génère 4 conditions OR par pet', async () => {
    findManyMock.mockResolvedValue([]);
    await getMatchingProducts([{ id: 'p1', species: 'DOG', dateOfBirth: subYears(new Date(), 8) }]);
    const args = findManyMock.mock.calls[0][0];
    expect(args.where.OR).toHaveLength(4);
    expect(args.where.OR).toEqual(
      expect.arrayContaining([
        { targetSpecies: 'DOG', targetAge: 'SENIOR' },
        { targetSpecies: 'DOG', targetAge: 'ALL' },
        { targetSpecies: 'BOTH', targetAge: 'SENIOR' },
        { targetSpecies: 'BOTH', targetAge: 'ALL' },
      ]),
    );
  });

  it('Senior chien matche Canvit Senior MAXI + Chondro Super en priorité', async () => {
    findManyMock.mockResolvedValue([
      { id: 'a', name: 'Canvit Multi', price: 120, targetSpecies: 'DOG', targetAge: 'ALL', stock: 10, available: true, brand: null, category: null, imageUrl: null, weight: null, supplier: 'Canvit' },
      { id: 'b', name: 'Canvit Senior MAXI', price: 255, targetSpecies: 'DOG', targetAge: 'SENIOR', stock: 10, available: true, brand: null, category: null, imageUrl: null, weight: null, supplier: 'Canvit' },
      { id: 'c', name: 'Canvit Chondro Super', price: 360, targetSpecies: 'DOG', targetAge: 'SENIOR', stock: 10, available: true, brand: null, category: null, imageUrl: null, weight: null, supplier: 'Canvit' },
    ]);
    const result = await getMatchingProducts([{ id: 'p1', species: 'DOG', dateOfBirth: subYears(new Date(), 8) }]);
    // SENIOR avec prix le plus élevé en premier
    expect(result[0].id).toBe('c');
    expect(result[1].id).toBe('b');
    expect(result[2].id).toBe('a');
  });

  it('liste vide quand aucun pet', async () => {
    const result = await getMatchingProducts([]);
    expect(result).toEqual([]);
    expect(findManyMock).not.toHaveBeenCalled();
  });
});
