import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/decimal';
import { z } from 'zod';

function isAdmin(role?: string) {
  return role === 'ADMIN' || role === 'SUPERADMIN';
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  brand: z.string().max(100).optional(),
  reference: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  price: z.number().min(0).max(9_999_999),
  stock: z.number().int().min(0).max(999_999),
  available: z.boolean().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const products = await prisma.product.findMany({
    where: { available: true },
    orderBy: { name: 'asc' },
    take: 1000,
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
      available: p.available,
      createdAt: p.createdAt,
    })),
  );
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, brand, reference, category, price, stock, available = true } = parsed.data;

  const product = await prisma.product.create({
    data: {
      name: name.trim(),
      brand: brand?.trim() || null,
      reference: reference?.trim() || null,
      category: category?.trim() || null,
      price,
      stock,
      available,
    },
  });

  return NextResponse.json({
    id: product.id,
    name: product.name,
    brand: product.brand,
    reference: product.reference,
    category: product.category,
    price: toNumber(product.price),
    stock: product.stock,
    available: product.available,
    createdAt: product.createdAt,
  }, { status: 201 });
}
