// Pricing for Dog Universe — server-side facade.
// Pure rule helpers live in `pricing-rules.ts` (no prisma dep, safe to bundle
// in client components). This module adds `getPricingSettings()` which reads
// the Setting table and merges with PRICING_DEFAULTS.
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  PRICING_DEFAULTS,
  getPensionPriceNumber,
  type PricingSettings,
} from '@/lib/pricing-rules';

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

export async function getPricingSettings(): Promise<PricingSettings> {
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
}
