import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/decimal';
import { z } from 'zod';
import { logger } from '@/lib/logger';

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
  // Upsell targeting (20260510_product_upsell)
  targetSpecies: z.enum(['DOG', 'CAT', 'BOTH']).optional(),
  targetAge: z.enum(['PUPPY', 'JUNIOR', 'ADULT', 'SENIOR', 'ALL']).optional(),
  supplier: z.string().max(100).optional(),
  weight: z.string().max(50).optional(),
  imageUrl: z.string().max(2048).optional(),
});

function serializeProduct(p: {
  id: string; name: string; brand: string | null; reference: string | null;
  category: string | null; price: unknown; stock: number; available: boolean;
  targetSpecies: string; targetAge: string; supplier: string | null;
  weight: string | null; imageUrl: string | null; createdAt: Date;
}) {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    reference: p.reference,
    category: p.category,
    price: toNumber(p.price as never),
    stock: p.stock,
    available: p.available,
    targetSpecies: p.targetSpecies,
    targetAge: p.targetAge,
    supplier: p.supplier,
    weight: p.weight,
    imageUrl: p.imageUrl,
    createdAt: p.createdAt,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const products = await prisma.product.findMany({
    orderBy: { name: 'asc' },
    take: 1000,
  });

  logger.error('admin-products', 'GET', { count: products.length });

  return NextResponse.json(products.map(serializeProduct));
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

  const {
    name, brand, reference, category, price, stock, available = true,
    targetSpecies = 'BOTH', targetAge = 'ALL', supplier, weight, imageUrl,
  } = parsed.data;

  const product = await prisma.product.create({
    data: {
      name: name.trim(),
      brand: brand?.trim() || null,
      reference: reference?.trim() || null,
      category: category?.trim() || null,
      price,
      stock,
      available,
      targetSpecies,
      targetAge,
      supplier: supplier?.trim() || null,
      weight: weight?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
    },
  });

  return NextResponse.json(serializeProduct(product), { status: 201 });
}
