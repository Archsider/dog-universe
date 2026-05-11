// Pricing for Dog Universe — server-side facade.
// Pure rule helpers live in `pricing-rules.ts` (no prisma dep, safe to bundle
// in client components). This module adds `getPricingSettings()` which reads
// the Setting table and merges with PRICING_DEFAULTS.
import { cache } from 'react';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { cacheReadThrough, cacheDel } from '@/lib/cache';
import {
  PRICING_DEFAULTS,
  getPensionPriceNumber,
  type PricingSettings,
} from '@/lib/pricing-rules';

const PRICING_CACHE_KEY = 'pricing:settings';
const PRICING_CACHE_TTL = 300; // 5 min — pricing settings change rarely (<1×/month).

/**
 * Invalidate the pricing-settings cache. Call after every successful mutation
 * of the `Setting` table (PUT /api/admin/settings) so the next
 * `getPricingSettings()` reflects the new value within ~1 second.
 * Pattern mirrors `invalidateCapacityCache()`.
 */
export async function invalidatePricingCache(): Promise<void> {
  await cacheDel(PRICING_CACHE_KEY);
}

export {
  PRICING_DEFAULTS,
  calculateBoardingBreakdown,
  calculateTaxiPrice,
  calculateBoardingTotalForExtension,
  getPensionPriceNumber,
} from '@/lib/pricing-rules';

/**
 * Tarif pension par animal et par nuit, retourné en `Prisma.Decimal` pour
 * écrire directement dans `InvoiceItem.unitPrice` (colonne `Decimal(10,2)`).
 *
 * Règles métier — source unique de vérité :
 *   - Chat                        : 70 MAD
 *   - Chien, séjour ≥ 32 nuits    : 100 MAD
 *   - 2+ chiens                   : 100 MAD/chien
 *   - 1 chien seul, < 32 nuits    : 120 MAD
 *
 * Utiliser ce helper PARTOUT où un InvoiceItem BOARDING est créé ou
 * mis à jour. Ne jamais coder un tarif pension en dur.
 */
export function getPensionPrice(
  pet: { species: string },
  totalDogsInBooking: number,
  totalNights: number,
  settings?: PricingSettings,
): Prisma.Decimal {
  return new Prisma.Decimal(
    getPensionPriceNumber(pet, totalDogsInBooking, totalNights, settings ?? PRICING_DEFAULTS),
  );
}

export type {
  PricingSettings,
  TaxiType,
  GroomingSize,
  ItemCategory,
  PriceLineItem,
  PriceBreakdown,
  PetForPricing,
} from '@/lib/pricing-rules';

// Hardcoded fallback defaults (used if no DB setting found)
export const TAXI_PRICES = {
  STANDARD: 150,
  VET: 300,
  AIRPORT: 300,
} as const;

export const GROOMING_PRICES = {
  SMALL: 100,
  LARGE: 150,
} as const;

export const TAXI_ADDON_PRICE = 150;

// React `cache()` memoizes per-request when called from a Server Component
// (within the same render tree the function executes at most once). In API
// routes it is a no-op — each request starts a fresh cache scope — so the
// existing Redis layer keeps doing its job. Stacking the two means a page
// that hits pricing across N components only pays one DB/Redis round-trip.
export const getPricingSettings = cache(
  async (): Promise<PricingSettings> => {
    return cacheReadThrough(PRICING_CACHE_KEY, PRICING_CACHE_TTL, async () => {
      try {
        const rows = await prisma.setting.findMany();
        const settings = { ...PRICING_DEFAULTS };
        for (const row of rows) {
          const key = row.key as keyof PricingSettings;
          if (key in settings) {
            settings[key] = parseFloat(row.value) || settings[key];
          }
        }
        return settings;
      } catch {
        return { ...PRICING_DEFAULTS };
      }
    });
  },
);
