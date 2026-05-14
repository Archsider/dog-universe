import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/decimal';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { serializeProduct } from './_lib/serialize';

function isAdmin(role?: string) {
  return role === 'ADMIN' || role === 'SUPERADMIN';
}

const createSchema = z.object({
  name: z.string().min(2).max(200),
  brand: z.string().max(100).optional(),
  reference: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  price: z.number().min(0).max(9_999_999),
  costPrice: z.number().min(0).max(9_999_999).optional(),
  stock: z.number().int().min(0).max(999_999),
  lowStockThreshold: z.number().int().min(0).max(999_999).optional(),
  available: z.boolean().optional(),
  // Upsell targeting (20260510_product_upsell)
  targetSpecies: z.enum(['DOG', 'CAT', 'BOTH']).optional(),
  targetAge: z.enum(['PUPPY', 'JUNIOR', 'ADULT', 'SENIOR', 'ALL']).optional(),
  supplier: z.string().max(100).optional(),
  weight: z.string().max(50).optional(),
  imageUrl: z.string().max(2048).optional(),
});


export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category')?.trim() || undefined;
  const archivedFlag = searchParams.get('archived'); // 'true' | 'false' | null
  const search = searchParams.get('search')?.trim() || undefined;

  // Default: only active (non-archived). Pass `archived=true` to see archived.
  const isArchived = archivedFlag === 'true' ? true : archivedFlag === 'false' ? false : false;

  const products = await prisma.product.findMany({
    where: {
      isArchived,
      ...(category && { category }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { reference: { contains: search, mode: 'insensitive' } },
        ],
      }),
    },
    orderBy: { name: 'asc' },
    take: 1000,
  });

  logger.info('admin-products', 'GET', { count: products.length, isArchived });

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
    name, brand, reference, category, description, price, costPrice,
    stock, lowStockThreshold, available = true,
    targetSpecies = 'BOTH', targetAge = 'ALL', supplier, weight, imageUrl,
  } = parsed.data;

  const product = await prisma.product.create({
    data: {
      name: name.trim(),
      brand: brand?.trim() || null,
      reference: reference?.trim() || null,
      category: category?.trim() || null,
      description: description?.trim() || null,
      price,
      costPrice: costPrice ?? null,
      stock,
      lowStockThreshold: lowStockThreshold ?? null,
      available,
      targetSpecies,
      targetAge,
      supplier: supplier?.trim() || null,
      weight: weight?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
    },
  });

  await prisma.actionLog.create({
    data: {
      userId: session.user.id,
      action: 'PRODUCT_CREATED',
      entityType: 'PRODUCT',
      entityId: product.id,
      details: JSON.stringify({ name: product.name, price: toNumber(product.price), stock: product.stock }),
    },
  });

  return NextResponse.json(serializeProduct(product), { status: 201 });
}
