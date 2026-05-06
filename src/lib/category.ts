// Catégorisation des InvoiceItem — bucket KPI à partir de l'enum DB
// (`category`) avec fallback inférence par description pour les rows legacy
// persistées avec category=OTHER avant que la colonne soit obligatoire.
//
// Règle métier : tout item lié à un Product (productId non-null) est PRODUCT,
// imposé à la création (voir src/lib/accounting.ts + service de création).

export type CategoryBucket = 'boarding' | 'taxi' | 'grooming' | 'croquettes' | null;

export function categoryKey(cat: string, description?: string): CategoryBucket {
  if (cat === 'BOARDING') return 'boarding';
  if (cat === 'PET_TAXI') return 'taxi';
  if (cat === 'GROOMING') return 'grooming';
  if (cat === 'PRODUCT') return 'croquettes';
  if (description) {
    const d = description.toLowerCase();
    if (d.includes('pension') || d.includes('boarding') || d.includes('nuit') || d.includes('hébergement')) return 'boarding';
    if (d.includes('taxi') || d.includes('transport') || d.includes('aller') || d.includes('retour')) return 'taxi';
    if (d.includes('toilettage') || d.includes('grooming') || d.includes('soin') || d.includes('bain') || d.includes('coupe')) return 'grooming';
    if (d.includes('croquette') || d.includes('kibble') || d.includes('nourriture') || d.includes('royal') || d.includes('grain')) return 'croquettes';
  }
  return null;
}

export function inferItemCategory(
  cat: string,
  description?: string,
): 'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT' | 'OTHER' {
  const k = categoryKey(cat, description);
  if (k === 'boarding') return 'BOARDING';
  if (k === 'taxi') return 'PET_TAXI';
  if (k === 'grooming') return 'GROOMING';
  if (k === 'croquettes') return 'PRODUCT';
  return 'OTHER';
}
