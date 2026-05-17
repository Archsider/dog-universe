import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/decimal';

export async function GET() {
  const guard = await requireRole(['CLIENT']);
  if (guard.error) return guard.error;

  const products = await prisma.product.findMany({
    where: { available: true, stock: { gt: 0 } },
    orderBy: { name: 'asc' },
    take: 500,
  });

  return NextResponse.json(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      reference: p.reference,
      category: p.category,
      price: toNumber(p.price),
      stock: p.stock,
    })),
    {
      // Per-user authenticated route — only browser-cache (private), no CDN.
      headers: { 'Cache-Control': 'private, max-age=30' },
    },
  );
}
