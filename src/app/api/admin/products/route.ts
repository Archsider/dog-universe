import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/decimal';

/**
 * Lists active products (stock > 0) for the booking-add-product dropdown.
 * Admin-only.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const products = await prisma.product.findMany({
    where: { active: true, stock: { gt: 0 } },
    orderBy: { name: 'asc' },
    take: 500,
  });

  return NextResponse.json(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      reference: p.reference,
      price: toNumber(p.price),
      stock: p.stock,
    })),
  );
}
