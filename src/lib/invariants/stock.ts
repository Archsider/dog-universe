// Inventory invariants. Currently a single check (negative stock) — the
// dedicated file is a domain anchor for future stock-related invariants
// (low-stock alerts, orphan products, etc.) without re-bloating the
// invoice file.

import { prisma } from '../prisma';
import type { InvariantResult } from './types';

export async function checkNegativeStock(): Promise<InvariantResult> {
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; stock: number }>>`
    SELECT id, name, stock FROM "Product" WHERE stock < 0 ORDER BY stock ASC LIMIT 5
  `;
  const countRow = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c FROM "Product" WHERE stock < 0
  `;
  return {
    key: 'negative_stock',
    label: 'Produits avec stock négatif',
    count: Number(countRow[0]?.c ?? BigInt(0)),
    sample: rows,
    severity: 'critical',
  };
}
