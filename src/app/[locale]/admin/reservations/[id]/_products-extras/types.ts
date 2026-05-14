// Shared types + constants for the Produits & Extras section of the
// admin reservation detail page.

export type Category =
  | 'BOARDING'
  | 'PET_TAXI'
  | 'GROOMING'
  | 'PRODUCT'
  | 'OTHER'
  | 'DISCOUNT'
  | 'EXTRA_SERVICE'
  | 'MISC_FEE';

export interface BookingItem {
  id: string;
  productId: string | null;
  invoiceItemId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  category: Category;
  version: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  brand?: string | null;
  reference?: string | null;
  price: number;
  stock: number;
  lowStockThreshold?: number | null;
  category?: string | null;
  targetSpecies?: string | null;
}

/** Categories the operator can pick when adding a free (non-catalog) line. */
export const FREE_CATEGORIES: Category[] = ['EXTRA_SERVICE', 'MISC_FEE', 'DISCOUNT'];

export const CATEGORY_LABEL: Record<Category, { fr: string; en: string; tone: string }> = {
  BOARDING:      { fr: 'Pension',         en: 'Boarding',       tone: 'bg-gold-100 text-gold-800' },
  PET_TAXI:      { fr: 'Taxi',            en: 'Taxi',           tone: 'bg-blue-100 text-blue-700' },
  GROOMING:      { fr: 'Toilettage',      en: 'Grooming',       tone: 'bg-purple-100 text-purple-700' },
  PRODUCT:       { fr: 'Produit',         en: 'Product',        tone: 'bg-emerald-100 text-emerald-700' },
  OTHER:         { fr: 'Autre',           en: 'Other',          tone: 'bg-gray-100 text-gray-700' },
  DISCOUNT:      { fr: 'Remise',          en: 'Discount',       tone: 'bg-amber-100 text-amber-700' },
  EXTRA_SERVICE: { fr: 'Service extra',   en: 'Extra service',  tone: 'bg-indigo-100 text-indigo-700' },
  MISC_FEE:      { fr: 'Frais divers',    en: 'Misc fee',       tone: 'bg-slate-100 text-slate-700' },
};

export const t = (fr: string, en: string, locale: string): string =>
  locale === 'en' ? en : fr;
