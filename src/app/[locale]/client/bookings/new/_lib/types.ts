export interface Pet {
  id: string;
  name: string;
  species: string; // 'DOG' | 'CAT'
  breed: string | null;
  photoUrl: string | null;
}

export type BookingType = 'BOARDING' | 'PET_TAXI';
export type TaxiType = 'STANDARD' | 'VET' | 'AIRPORT';
export type PetSize = 'SMALL' | 'LARGE';

export interface PriceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export const TAXI_PRICES = { STANDARD: 150, VET: 300, AIRPORT: 300 } as const;
export const GROOMING_PRICES = { SMALL: 100, LARGE: 150 } as const;
export const TAXI_ADDON_PRICE = 150;

// Boarding pricing rules
export const DOG_PRICE_SINGLE = 120; // 1 chien, ≤32 nuits
export const DOG_PRICE_LONG = 100;   // 1 chien, >32 nuits
export const DOG_PRICE_MULTI = 100;  // 2+ chiens par chien
export const CAT_PRICE = 70;         // Chat, peu importe
