// Product row → JSON serialiser. Lives outside route.ts because Next.js 15
// no longer allows arbitrary exports from route files (only HTTP method
// handlers + a small set of config exports).

import { toNumber } from '@/lib/decimal';

type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  reference: string | null;
  category: string | null;
  description: string | null;
  price: unknown;
  costPrice: unknown;
  stock: number;
  lowStockThreshold: number | null;
  available: boolean;
  isArchived: boolean;
  version: number;
  targetSpecies: string;
  targetAge: string;
  supplier: string | null;
  weight: string | null;
  imageUrl: string | null;
  createdAt: Date;
};

export function serializeProduct(p: ProductRow) {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    reference: p.reference,
    category: p.category,
    description: p.description,
    price: toNumber(p.price as never),
    costPrice: p.costPrice == null ? null : toNumber(p.costPrice as never),
    stock: p.stock,
    lowStockThreshold: p.lowStockThreshold,
    available: p.available,
    isArchived: p.isArchived,
    version: p.version,
    targetSpecies: p.targetSpecies,
    targetAge: p.targetAge,
    supplier: p.supplier,
    weight: p.weight,
    imageUrl: p.imageUrl,
    createdAt: p.createdAt,
  };
}
