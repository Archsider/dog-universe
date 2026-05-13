// PATCH  /api/admin/bookings/[id]/items/[itemId]
// DELETE /api/admin/bookings/[id]/items/[itemId]
//
// PATCH:
//   - Optimistic locking via { version } in body.
//   - For catalog items (productId set): description/category are immutable;
//     quantity changes adjust Product.stock by the diff under FOR UPDATE.
//   - For free items: any field editable.
//
// DELETE:
//   - Restores Product.stock by quantity if the item was a catalog item.
//   - ActionLog with the deleted snapshot.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { toNumber } from '@/lib/decimal';

interface Params { params: Promise<{ id: string; itemId: string }> }

function isAdmin(role?: string) {
  return role === 'ADMIN' || role === 'SUPERADMIN';
}

const patchSchema = z.object({
  version: z.number().int().min(0),
  description: z.string().min(1).max(200).optional(),
  category: z.enum(['EXTRA_SERVICE', 'MISC_FEE', 'DISCOUNT', 'OTHER']).optional(),
  quantity: z.number().int().min(1).max(1000).optional(),
  unitPrice: z.number().min(-9_999_999).max(9_999_999).optional(),
});

function serializeItem(it: {
  id: string; bookingId: string; productId: string | null;
  description: string; quantity: number; unitPrice: unknown; total: unknown;
  category: string; version: number;
}) {
  return {
    id: it.id,
    bookingId: it.bookingId,
    productId: it.productId,
    description: it.description,
    quantity: it.quantity,
    unitPrice: toNumber(it.unitPrice as never),
    total: toNumber(it.total as never),
    category: it.category,
    version: it.version,
  };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id: bookingId, itemId } = await params;
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
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await prisma.bookingItem.findFirst({
    where: { id: itemId, bookingId },
  });
  if (!existing) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (existing.version !== parsed.data.version) {
    return NextResponse.json(
      { error: 'VERSION_CONFLICT', currentVersion: existing.version },
      { status: 409 },
    );
  }

  const isCatalog = existing.productId !== null;
  const { description, category, quantity, unitPrice } = parsed.data;

  // Catalog items: description and category are derived from Product and locked.
  if (isCatalog && (description !== undefined || category !== undefined)) {
    return NextResponse.json({ error: 'CATALOG_FIELD_IMMUTABLE' }, { status: 400 });
  }
  if (category === 'DISCOUNT' && unitPrice !== undefined && unitPrice > 0) {
    return NextResponse.json({ error: 'DISCOUNT_MUST_BE_NEGATIVE' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const newQuantity = quantity ?? existing.quantity;
      const newUnitPrice = unitPrice ?? toNumber(existing.unitPrice as never);
      const newTotal = Number((newUnitPrice * newQuantity).toFixed(2));

      // Catalog quantity change → stock diff under FOR UPDATE.
      if (isCatalog && existing.productId && newQuantity !== existing.quantity) {
        const diff = newQuantity - existing.quantity; // positive: need more stock
        const locked = await tx.$queryRaw<Array<{ id: string; stock: number }>>`
          SELECT id, stock FROM "Product" WHERE id = ${existing.productId} FOR UPDATE
        `;
        const product = locked[0];
        if (!product) throw new Error('PRODUCT_NOT_FOUND');
        if (diff > 0 && product.stock < diff) throw new Error('INSUFFICIENT_STOCK');
        await tx.product.update({
          where: { id: existing.productId },
          data: { stock: { decrement: diff } },
        });
      }

      const updated = await tx.bookingItem.update({
        where: { id: itemId },
        data: {
          ...(description !== undefined && !isCatalog && { description }),
          ...(category !== undefined && !isCatalog && { category }),
          ...(quantity !== undefined && { quantity: newQuantity }),
          ...(unitPrice !== undefined && { unitPrice: new Prisma.Decimal(newUnitPrice) }),
          total: new Prisma.Decimal(newTotal),
          version: { increment: 1 },
        },
      });

      await tx.actionLog.create({
        data: {
          userId: session.user.id,
          action: 'BOOKING_ITEM_UPDATED',
          entityType: 'BOOKING_ITEM',
          entityId: itemId,
          details: JSON.stringify({
            before: {
              description: existing.description,
              quantity: existing.quantity,
              unitPrice: toNumber(existing.unitPrice as never),
              total: toNumber(existing.total as never),
              version: existing.version,
            },
            after: {
              description: updated.description,
              quantity: updated.quantity,
              unitPrice: toNumber(updated.unitPrice as never),
              total: toNumber(updated.total as never),
              version: updated.version,
            },
          }),
        },
      });

      return updated;
    });

    return NextResponse.json(serializeItem(result));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    if (msg === 'PRODUCT_NOT_FOUND' || msg === 'INSUFFICIENT_STOCK') {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id: bookingId, itemId } = await params;
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const existing = await prisma.bookingItem.findFirst({
    where: { id: itemId, bookingId },
  });
  if (!existing) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    if (existing.productId) {
      await tx.product.update({
        where: { id: existing.productId },
        data: { stock: { increment: existing.quantity } },
      });
    }
    await tx.bookingItem.delete({ where: { id: itemId } });
    await tx.actionLog.create({
      data: {
        userId: session.user.id,
        action: 'BOOKING_ITEM_DELETED',
        entityType: 'BOOKING_ITEM',
        entityId: itemId,
        details: JSON.stringify({
          bookingId,
          description: existing.description,
          quantity: existing.quantity,
          total: toNumber(existing.total as never),
          stockRestored: existing.productId ? existing.quantity : 0,
        }),
      },
    });
  });

  return new NextResponse(null, { status: 204 });
}
