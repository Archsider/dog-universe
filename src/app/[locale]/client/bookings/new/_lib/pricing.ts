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
    const label = taxiType === 'STANDARD' ? (locale === 'fr' ? 'Pet Taxi — Standard' : 'Pet Taxi — Standard')
      : taxiType === 'VET' ? (locale === 'fr' ? 'Pet Taxi — Vétérinaire' : 'Pet Taxi — Vet')
      : (locale === 'fr' ? 'Pet Taxi — Aéroport' : 'Pet Taxi — Airport');
    return { items: [{ description: label, quantity: 1, unitPrice: price, total: price }], total: price };
  }

  const nights = calculateNights(checkIn, checkOut);
  const items: PriceItem[] = [];

  // Dogs
  if (dogPets.length === 1) {
    const pricePerNight = nights > 32 ? DOG_PRICE_LONG : DOG_PRICE_SINGLE;
    items.push({
      description: locale === 'fr' ? `Pension ${dogPets[0].name} (chien)` : `Boarding ${dogPets[0].name} (dog)`,
      quantity: nights,
      unitPrice: pricePerNight,
      total: nights * pricePerNight,
    });
  } else if (dogPets.length > 1) {
    dogPets.forEach(dog => {
      items.push({
        description: locale === 'fr' ? `Pension ${dog.name} (chien)` : `Boarding ${dog.name} (dog)`,
        quantity: nights,
        unitPrice: DOG_PRICE_MULTI,
        total: nights * DOG_PRICE_MULTI,
      });
    });
  }

  // Cats
  catPets.forEach(cat => {
    items.push({
      description: locale === 'fr' ? `Pension ${cat.name} (chat)` : `Boarding ${cat.name} (cat)`,
      quantity: nights,
      unitPrice: CAT_PRICE,
      total: nights * CAT_PRICE,
    });
  });

  // Grooming (dogs only)
  dogPets.forEach(dog => {
    if (groomingPets[dog.id]) {
      const groomPrice = petSizes[dog.id] === 'LARGE' ? GROOMING_PRICES.LARGE : GROOMING_PRICES.SMALL;
      const sizeLabel = petSizes[dog.id] === 'LARGE' ? (locale === 'fr' ? 'grand' : 'large') : (locale === 'fr' ? 'petit' : 'small');
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
      description: locale === 'fr' ? 'Pet Taxi — Aller' : 'Pet Taxi — Drop-off',
      quantity: 1,
      unitPrice: TAXI_ADDON_PRICE,
      total: TAXI_ADDON_PRICE,
    });
  }
  if (taxiReturnEnabled) {
    items.push({
      description: locale === 'fr' ? 'Pet Taxi — Retour' : 'Pet Taxi — Pick-up',
      quantity: 1,
      unitPrice: TAXI_ADDON_PRICE,
      total: TAXI_ADDON_PRICE,
    });
  }

  return { items, total: items.reduce((sum, item) => sum + item.total, 0) };
}
