import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/decimal';
import { z } from 'zod';
import { serializeProduct } from '../_lib/serialize';
import { withSpan } from '@/lib/observability';

interface Params { params: Promise<{ id: string }> }

const patchSchema = z.object({
  // Optimistic locking — caller MUST send the version they read.
  version: z.number().int().min(0),
  // All other fields are partial updates: optional, and intentionally permissive
  // (min(1) on name) so PATCH /products/[id] never rejects a routing-only call
  // before the 404 / VERSION_CONFLICT checks can run.
  name: z.string().min(1).max(200).optional(),
  brand: z.string().max(100).nullable().optional(),
  reference: z.string().max(100).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  price: z.number().min(0).max(9_999_999).optional(),
  costPrice: z.number().min(0).max(9_999_999).nullable().optional(),
  stock: z.number().int().min(0).max(999_999).optional(),
  lowStockThreshold: z.number().int().min(0).max(999_999).nullable().optional(),
  available: z.boolean().optional(),
  targetSpecies: z.enum(['DOG', 'CAT', 'BOTH']).optional(),
  targetAge: z.enum(['PUPPY', 'JUNIOR', 'ADULT', 'SENIOR', 'ALL']).optional(),
  supplier: z.string().max(100).nullable().optional(),
  weight: z.string().max(50).nullable().optional(),
  imageUrl: z.string().max(2048).nullable().optional(),
});

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const authResult = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (authResult.error) return authResult.error;
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json(serializeProduct(product));
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const authResult = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (authResult.error) return authResult.error;
  const { session } = authResult;

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

  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const {
    version, name, brand, reference, category, description, price, costPrice,
    stock, lowStockThreshold, available,
    targetSpecies, targetAge, supplier, weight, imageUrl,
  } = parsed.data;

  // Optimistic locking — fail loudly if the row moved under us so the UI can
  // refresh and let the operator re-decide instead of silently overwriting.
  if (before.version !== version) {
    return NextResponse.json(
      { error: 'VERSION_CONFLICT', currentVersion: before.version },
      { status: 409 },
    );
  }

  const updated = await withSpan(
    'api.admin.products.update',
    { productId: id, actorId: session.user.id, version: before.version },
    () => prisma.product.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(brand !== undefined && { brand: brand?.trim() || null }),
      ...(reference !== undefined && { reference: reference?.trim() || null }),
      ...(category !== undefined && { category: category?.trim() || null }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(price !== undefined && { price }),
      ...(costPrice !== undefined && { costPrice: costPrice ?? null }),
      ...(stock !== undefined && { stock }),
      ...(lowStockThreshold !== undefined && { lowStockThreshold: lowStockThreshold ?? null }),
      ...(available !== undefined && { available }),
      ...(targetSpecies !== undefined && { targetSpecies }),
      ...(targetAge !== undefined && { targetAge }),
      ...(supplier !== undefined && { supplier: supplier?.trim() || null }),
      ...(weight !== undefined && { weight: weight?.trim() || null }),
      ...(imageUrl !== undefined && { imageUrl: imageUrl?.trim() || null }),
      version: { increment: 1 },
    },
  }),
  );

  await prisma.actionLog.create({
    data: {
      userId: session.user.id,
      action: 'PRODUCT_UPDATED',
      entityType: 'PRODUCT',
      entityId: id,
      details: JSON.stringify({
        before: { name: before.name, price: toNumber(before.price), stock: before.stock, version: before.version },
        after:  { name: updated.name, price: toNumber(updated.price), stock: updated.stock, version: updated.version },
      }),
    },
  });

  return NextResponse.json(serializeProduct(updated));
}

// Legacy DELETE — kept for clients still calling it. Refuses if the product is
// linked to any InvoiceItem; otherwise it now soft-archives instead of hard-deleting
// to preserve historical traceability (cf. spec — archive workflow is canonical).
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const authResult = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (authResult.error) return authResult.error;
  const { session } = authResult;

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  await withSpan(
    'api.admin.products.archive',
    { productId: id, actorId: session.user.id },
    () => prisma.product.update({
      where: { id },
      data: { isArchived: true, version: { increment: 1 } },
    }),
  );

  await prisma.actionLog.create({
    data: {
      userId: session.user.id,
      action: 'PRODUCT_ARCHIVED',
      entityType: 'PRODUCT',
      entityId: id,
      details: JSON.stringify({ via: 'DELETE legacy', name: product.name }),
    },
  });

  return new NextResponse(null, { status: 204 });
}
