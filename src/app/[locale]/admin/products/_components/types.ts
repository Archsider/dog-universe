// Shared types + constants for the Products admin page sub-components.
// Centralised here so each component file imports the same shape without
// duplicating the constants list.

export interface Product {
  id: string;
  name: string;
  brand: string | null;
  reference: string | null;
  category: string | null;
  description?: string | null;
  price: number;
  costPrice?: number | null;
  stock: number;
  lowStockThreshold?: number | null;
  available: boolean;
  isArchived?: boolean;
  version?: number;
  targetSpecies?: string;
  targetAge?: string;
  supplier?: string | null;
  weight?: string | null;
  imageUrl?: string | null;
  createdAt: string;
}

export interface ProductForm {
  name: string;
  brand: string;
  reference: string;
  category: string;
  description: string;
  price: string;
  costPrice: string;
  stock: string;
  lowStockThreshold: string;
  available: boolean;
  targetSpecies: string;
  targetAge: string;
  supplier: string;
  weight: string;
  imageUrl: string;
}

export const EMPTY_FORM: ProductForm = {
  name: '', brand: '', reference: '', category: '', description: '',
  price: '', costPrice: '', stock: '0', lowStockThreshold: '', available: true,
  targetSpecies: 'BOTH', targetAge: 'ALL', supplier: '', weight: '', imageUrl: '',
};

export const SPECIES_LABEL: Record<string, string> = {
  DOG: 'Chien', CAT: 'Chat', BOTH: 'Tous',
};

export const AGE_LABEL: Record<string, string> = {
  PUPPY: 'Chiot/Chaton', JUNIOR: 'Jeune', ADULT: 'Adulte', SENIOR: 'Senior', ALL: 'Tout âge',
};

export const PRODUCT_CATEGORIES = [
  'FOOD', 'TOY', 'ACCESSORY', 'GROOMING', 'HEALTH', 'OTHER',
] as const;

export const CATEGORY_LABEL_FR: Record<string, string> = {
  FOOD: 'Nourriture', TOY: 'Jouet', ACCESSORY: 'Accessoire',
  GROOMING: 'Toilettage', HEALTH: 'Santé', OTHER: 'Autre',
};

export const CATEGORY_LABEL_EN: Record<string, string> = {
  FOOD: 'Food', TOY: 'Toy', ACCESSORY: 'Accessory',
  GROOMING: 'Grooming', HEALTH: 'Health', OTHER: 'Other',
};

/** Tiny i18n helper kept inline because every file uses it. */
export const t = (fr: string, en: string, locale: string): string =>
  locale === 'en' ? en : fr;

/** Product is "low stock" when threshold is set + stock falls under it. */
export function isLowStock(p: Product): boolean {
  return (
    p.lowStockThreshold != null &&
    p.lowStockThreshold > 0 &&
    p.stock <= p.lowStockThreshold
  );
}
