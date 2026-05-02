// Pricing for Dog Universe — server-side facade.
// Pure rule helpers live in `pricing-rules.ts` (no prisma dep, safe to bundle
// in client components). This module adds `getPricingSettings()` which reads
// the Setting table and merges with PRICING_DEFAULTS.
import { prisma } from '@/lib/prisma';
import { PRICING_DEFAULTS, type PricingSettings } from '@/lib/pricing-rules';

export {
  PRICING_DEFAULTS,
  calculateBoardingBreakdown,
  calculateTaxiPrice,
  calculateBoardingTotalForExtension,
} from '@/lib/pricing-rules';

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
