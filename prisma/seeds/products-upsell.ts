// Source TS du catalogue Ultra Premium + Canvit. La migration SQL
// `20260510_seed_products_upsell` exécute les INSERTs idempotents au
// build. Ce fichier reste pour réutilisation dans des scripts admin
// ou des tests futurs.

export interface UpsellSeedProduct {
  name: string;
  price: number;
  targetSpecies: 'DOG' | 'CAT' | 'BOTH';
  targetAge: 'PUPPY' | 'JUNIOR' | 'ADULT' | 'SENIOR' | 'ALL';
  category: 'CROQUETTES' | 'FRIANDISES' | 'HUILE' | 'COMPLEMENT';
  supplier: 'Ultra Premium' | 'Canvit';
  weight?: string;
}

// Catalogue de référence — voir migration SQL pour la liste complète.
// Stock initial = 0, available = true par défaut.
export const UPSELL_PRODUCTS: UpsellSeedProduct[] = [
  // Voir prisma/migrations/20260510_seed_products_upsell/migration.sql.
];
