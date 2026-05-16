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

export type ClientMode = 'existing' | 'anonymous';

export interface WalkinItem {
  id: string; // local row key
  category: ItemCategory;
  description: string;
  quantity: number;
  unitPrice: number;
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
