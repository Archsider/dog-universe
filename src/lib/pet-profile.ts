// Profil animal + matching produits — source unique de vérité pour les
// recommandations upsell (espèce + âge). Les routes API
// /api/(client|admin)/products/suggestions appellent `getMatchingProducts()`.
// Ne JAMAIS filtrer manuellement par espèce/âge dans une autre route.

import { differenceInMonths } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/decimal';

export type AgeCategory = 'PUPPY' | 'JUNIOR' | 'ADULT' | 'SENIOR';
export type Species = 'DOG' | 'CAT';

/**
 * Catégorise un animal par âge :
 *   - <12 mois → PUPPY
 *   - 12-23 mois → JUNIOR
 *   - 24-83 mois → ADULT
 *   - ≥84 mois → SENIOR
 *   - dateOfBirth null → ADULT par défaut
 */
export function getAgeCategory(
  dateOfBirth: Date | null,
  _species: Species,
): AgeCategory {
  if (!dateOfBirth) return 'ADULT';
  const ageMonths = differenceInMonths(new Date(), dateOfBirth);
  if (ageMonths < 12) return 'PUPPY';
  if (ageMonths < 24) return 'JUNIOR';
  if (ageMonths >= 84) return 'SENIOR';
  return 'ADULT';
}

export function ageCategoryLabelFr(category: AgeCategory, species: Species): string {
  switch (category) {
    case 'PUPPY':  return species === 'DOG' ? 'Chiot' : 'Chaton';
    case 'JUNIOR': return 'Jeune';
    case 'ADULT':  return 'Adulte';
    case 'SENIOR': return 'Senior (7+)';
  }
}

export function ageCategoryLabelEn(category: AgeCategory, species: Species): string {
  switch (category) {
    case 'PUPPY':  return species === 'DOG' ? 'Puppy' : 'Kitten';
    case 'JUNIOR': return 'Junior';
    case 'ADULT':  return 'Adult';
    case 'SENIOR': return 'Senior (7+)';
  }
}

export interface UpsellProduct {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  price: number;
  stock: number;
  available: boolean;
  targetSpecies: string;
  targetAge: string;
  imageUrl: string | null;
  weight: string | null;
  supplier: string | null;
}

function ageRelevance(targetAge: string, petAge: AgeCategory): number {
  if (targetAge === petAge) {
    if (petAge === 'SENIOR') return 100;
    if (petAge === 'PUPPY') return 95;
    if (petAge === 'JUNIOR') return 80;
    return 70;
  }
  if (targetAge === 'ALL') return 50;
  return 0;
}

function speciesRelevance(targetSpecies: string, petSpecies: Species): number {
  if (targetSpecies === petSpecies) return 30;
  if (targetSpecies === 'BOTH') return 20;
  return 0;
}

/**
 * Récupère les produits dispos qui matchent au moins un des animaux passés.
 * Filtre `available=true` et `stock>0` par défaut. Tri par pertinence
 * (SENIOR/PUPPY > JUNIOR > ADULT > ALL) puis prix décroissant (upsell
 * premium en premier).
 */
export async function getMatchingProducts(
  pets: { id: string; species: Species; dateOfBirth: Date | null }[],
  options: { includeOutOfStock?: boolean } = {},
): Promise<UpsellProduct[]> {
  if (pets.length === 0) return [];

  const profiles = pets.map((p) => ({
    species: p.species,
    ageCategory: getAgeCategory(p.dateOfBirth, p.species),
  }));

  const orFilters = profiles.flatMap((p) => [
    { targetSpecies: p.species, targetAge: p.ageCategory },
    { targetSpecies: p.species, targetAge: 'ALL' },
    { targetSpecies: 'BOTH', targetAge: p.ageCategory },
    { targetSpecies: 'BOTH', targetAge: 'ALL' },
  ]);

  const stockFilter = options.includeOutOfStock ? {} : { stock: { gt: 0 } };

  const rows = await prisma.product.findMany({
    where: { available: true, ...stockFilter, OR: orFilters },
    take: 200,
  });

  const scored = rows.map((p) => {
    const score = Math.max(
      ...profiles.map(
        (prof) => speciesRelevance(p.targetSpecies, prof.species) + ageRelevance(p.targetAge, prof.ageCategory),
      ),
    );
    return { p, score };
  });

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return toNumber(b.p.price) - toNumber(a.p.price);
  });

  return scored.map(({ p }) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    price: toNumber(p.price),
    stock: p.stock,
    available: p.available,
    targetSpecies: p.targetSpecies,
    targetAge: p.targetAge,
    imageUrl: p.imageUrl,
    weight: p.weight,
    supplier: p.supplier,
  }));
}

export async function getMatchingProductsForPet(
  pet: { id: string; species: Species; dateOfBirth: Date | null },
  options: { includeOutOfStock?: boolean } = {},
): Promise<UpsellProduct[]> {
  return getMatchingProducts([pet], options);
}
