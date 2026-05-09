import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/decimal';
import { z } from 'zod';

interface Params { params: Promise<{ id: string }> }

function isAdmin(role?: string) {
  return role === 'ADMIN' || role === 'SUPERADMIN';
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  brand: z.string().max(100).nullable().optional(),
  reference: z.string().max(100).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  price: z.number().min(0).max(9_999_999).optional(),
  stock: z.number().int().min(0).max(999_999).optional(),
  available: z.boolean().optional(),
  targetSpecies: z.enum(['DOG', 'CAT', 'BOTH']).optional(),
  targetAge: z.enum(['PUPPY', 'JUNIOR', 'ADULT', 'SENIOR', 'ALL']).optional(),
  supplier: z.string().max(100).nullable().optional(),
  weight: z.string().max(50).nullable().optional(),
  imageUrl: z.string().max(2048).nullable().optional(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() }, { status: 400 });
  }

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const {
    name, brand, reference, category, price, stock, available,
    targetSpecies, targetAge, supplier, weight, imageUrl,
  } = parsed.data;

  const updated = await prisma.product.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(brand !== undefined && { brand: brand?.trim() || null }),
      ...(reference !== undefined && { reference: reference?.trim() || null }),
      ...(category !== undefined && { category: category?.trim() || null }),
      ...(price !== undefined && { price }),
      ...(stock !== undefined && { stock }),
      ...(available !== undefined && { available }),
      ...(targetSpecies !== undefined && { targetSpecies }),
      ...(targetAge !== undefined && { targetAge }),
      ...(supplier !== undefined && { supplier: supplier?.trim() || null }),
      ...(weight !== undefined && { weight: weight?.trim() || null }),
      ...(imageUrl !== undefined && { imageUrl: imageUrl?.trim() || null }),
    },
  });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    brand: updated.brand,
    reference: updated.reference,
    category: updated.category,
    price: toNumber(updated.price),
    stock: updated.stock,
    available: updated.available,
    targetSpecies: updated.targetSpecies,
    targetAge: updated.targetAge,
    supplier: updated.supplier,
    weight: updated.weight,
    imageUrl: updated.imageUrl,
    createdAt: updated.createdAt,
  });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const linkedCount = await prisma.invoiceItem.count({ where: { productId: id } });
  if (linkedCount > 0) {
    return NextResponse.json({ error: 'PRODUCT_IN_USE' }, { status: 400 });
  }

  await prisma.product.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
