import {
  type BookingType,
  type Pet,
  type PetSize,
  type PriceItem,
  type TaxiType,
  CAT_PRICE,
  DOG_PRICE_LONG,
  DOG_PRICE_MULTI,
  DOG_PRICE_SINGLE,
  GROOMING_PRICES,
  TAXI_ADDON_PRICE,
  TAXI_PRICES,
} from './types';
import { pick } from './i18n';

export function calculateNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export interface PriceContext {
  bookingType: BookingType;
  locale: string;
  taxiType: TaxiType;
  checkIn: string;
  checkOut: string;
  dogPets: Pet[];
  catPets: Pet[];
  groomingPets: Record<string, boolean>;
  petSizes: Record<string, PetSize>;
  taxiGoEnabled: boolean;
  taxiReturnEnabled: boolean;
}

export function getPriceBreakdown(ctx: PriceContext): { items: PriceItem[]; total: number } {
  const {
    bookingType, locale, taxiType, checkIn, checkOut,
    dogPets, catPets, groomingPets, petSizes,
    taxiGoEnabled, taxiReturnEnabled,
  } = ctx;

  if (bookingType === 'PET_TAXI') {
    const price = TAXI_PRICES[taxiType];
    const label = taxiType === 'STANDARD'
      ? pick(locale, 'Pet Taxi — Standard', 'Pet Taxi — Standard', 'بيت تاكسي — عادي')
      : taxiType === 'VET'
        ? pick(locale, 'Pet Taxi — Vétérinaire', 'Pet Taxi — Vet', 'بيت تاكسي — الطبيب البيطري')
        : pick(locale, 'Pet Taxi — Aéroport', 'Pet Taxi — Airport', 'بيت تاكسي — المطار');
    return { items: [{ description: label, quantity: 1, unitPrice: price, total: price }], total: price };
  }

  const nights = calculateNights(checkIn, checkOut);
  const items: PriceItem[] = [];

  // Dogs
  if (dogPets.length === 1) {
    const pricePerNight = nights > 32 ? DOG_PRICE_LONG : DOG_PRICE_SINGLE;
    items.push({
      description: pick(
        locale,
        `Pension ${dogPets[0].name} (chien)`,
        `Boarding ${dogPets[0].name} (dog)`,
        `إيواء ${dogPets[0].name} (كلب)`,
      ),
      quantity: nights,
      unitPrice: pricePerNight,
      total: nights * pricePerNight,
    });
  } else if (dogPets.length > 1) {
    dogPets.forEach(dog => {
      items.push({
        description: pick(
          locale,
          `Pension ${dog.name} (chien)`,
          `Boarding ${dog.name} (dog)`,
          `إيواء ${dog.name} (كلب)`,
        ),
        quantity: nights,
        unitPrice: DOG_PRICE_MULTI,
        total: nights * DOG_PRICE_MULTI,
      });
    });
  }

  // Cats
  catPets.forEach(cat => {
    items.push({
      description: pick(
        locale,
        `Pension ${cat.name} (chat)`,
        `Boarding ${cat.name} (cat)`,
        `إيواء ${cat.name} (قطّ)`,
      ),
      quantity: nights,
      unitPrice: CAT_PRICE,
      total: nights * CAT_PRICE,
    });
  });

  // Grooming (dogs only)
  dogPets.forEach(dog => {
    if (groomingPets[dog.id]) {
      const groomPrice = petSizes[dog.id] === 'LARGE' ? GROOMING_PRICES.LARGE : GROOMING_PRICES.SMALL;
      const sizeLabel = petSizes[dog.id] === 'LARGE'
        ? pick(locale, 'grand', 'large', 'كبير')
        : pick(locale, 'petit', 'small', 'صغير');
      items.push({
        description: `Grooming ${dog.name} (${sizeLabel})`,
        quantity: 1,
        unitPrice: groomPrice,
        total: groomPrice,
      });
    }
  });

  // Taxi addon
  if (taxiGoEnabled) {
    items.push({
      description: pick(locale, 'Pet Taxi — Aller', 'Pet Taxi — Drop-off', 'بيت تاكسي — ذهاب'),
      quantity: 1,
      unitPrice: TAXI_ADDON_PRICE,
      total: TAXI_ADDON_PRICE,
    });
  }
  if (taxiReturnEnabled) {
    items.push({
      description: pick(locale, 'Pet Taxi — Retour', 'Pet Taxi — Pick-up', 'بيت تاكسي — إياب'),
      quantity: 1,
      unitPrice: TAXI_ADDON_PRICE,
      total: TAXI_ADDON_PRICE,
    });
  }

  return { items, total: items.reduce((sum, item) => sum + item.total, 0) };
}
