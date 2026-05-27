// Shared types + labels for the walk-in invoice modal flow.
//
// Lives next to the step components so the orchestrator stays minimal
// and the steps can be tested / imported in isolation.

export type ItemCategory =
  | 'BOARDING'
  | 'PET_TAXI'
  | 'GROOMING'
  | 'PRODUCT'
  | 'OTHER'
  | 'DISCOUNT';

export type PaymentMethod = 'CASH' | 'CARD' | 'CHECK' | 'TRANSFER';

export type ClientMode = 'existing' | 'new' | 'anonymous';

export interface WalkinItem {
  id: string; // local row key
  category: ItemCategory;
  description: string;
  quantity: number;
  unitPrice: number;
  /**
   * Catalog link — REQUIRED for `category='PRODUCT'`. The server-side Zod
   * refinement `PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID` rejects PRODUCT rows
   * without a productId. Set via `<ProductCatalogSearchSelect>` (either
   * picking an existing catalog row or quick-creating a new one).
   */
  productId?: string | null;
  /**
   * Smart pet-context (UI only — NOT sent to the server). Captured for
   * service categories (BOARDING / GROOMING / PET_TAXI) to derive the
   * description + unit price via `deriveWalkinLine`. The derived values
   * are baked into `description` / `unitPrice` before submit, so the
   * server contract is unchanged.
   */
  species?: 'DOG' | 'CAT';
  petName?: string;
  /** Count of nights OR months, per billingUnit (BOARDING). */
  nights?: number;
  /** Optional check-in / check-out (UI only) — when both set on a per-night
   *  BOARDING line, `nights` is derived from the span. Not sent to the server. */
  checkIn?: string;
  checkOut?: string;
  billingUnit?: 'NIGHT' | 'MONTH';
  groomingSize?: 'SMALL' | 'LARGE';
  taxiType?: 'STANDARD' | 'VET' | 'AIRPORT';
}

export const CATEGORY_LABELS: Record<ItemCategory, { fr: string; en: string }> = {
  BOARDING:   { fr: 'Pension',     en: 'Boarding' },
  PET_TAXI:   { fr: 'Pet Taxi',    en: 'Pet Taxi' },
  GROOMING:   { fr: 'Toilettage',  en: 'Grooming' },
  PRODUCT:    { fr: 'Croquettes / Produit', en: 'Food / Product' },
  OTHER:      { fr: 'Autre',       en: 'Other' },
  DISCOUNT:   { fr: 'Remise',      en: 'Discount' },
};

export const METHOD_LABELS: Record<PaymentMethod, { fr: string; en: string; emoji: string }> = {
  CASH:     { fr: 'Espèces',  en: 'Cash',     emoji: '💵' },
  CARD:     { fr: 'Carte',    en: 'Card',     emoji: '💳' },
  CHECK:    { fr: 'Chèque',   en: 'Check',    emoji: '📃' },
  TRANSFER: { fr: 'Virement', en: 'Transfer', emoji: '🏦' },
};
