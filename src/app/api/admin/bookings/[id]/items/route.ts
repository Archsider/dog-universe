// POST /api/admin/bookings/[id]/items
// GET  /api/admin/bookings/[id]/items
//
// Stage products + free-line extras on a booking BEFORE invoicing. Catalog items
// decrement Product.stock atomically via $transaction + FOR UPDATE on the product
// row (same pattern as the legacy /products route on InvoiceItem). Free-line
// items (productId null) accept EXTRA_SERVICE / MISC_FEE / DISCOUNT categories.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { toNumber } from '@/lib/decimal';
import { notDeleted } from '@/lib/prisma-soft';
import { withSpan } from '@/lib/observability';
import { requireRole } from '@/lib/auth-guards';

interface Params { params: Promise<{ id: string }> }

const catalogSchema = z.object({
  type: z.literal('catalog'),
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(1000),
});

const FREE_CATEGORIES = ['EXTRA_SERVICE', 'MISC_FEE', 'DISCOUNT'] as const;
const freeSchema = z.object({
  type: z.literal('free'),
  description: z.string().min(1).max(200),
  category: z.enum(FREE_CATEGORIES),
  quantity: z.number().int().min(1).max(1000),
  unitPrice: z.number().min(-9_999_999).max(9_999_999),
});

const postSchema = z.discriminatedUnion('type', [catalogSchema, freeSchema]);

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

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: bookingId } = await params;
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;

  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id: bookingId }),
    select: { id: true },
  });
  if (!booking) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const items = await prisma.bookingItem.findMany({
    where: { bookingId },
    orderBy: { id: 'asc' },
  });
  return NextResponse.json(items.map(serializeItem));
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: bookingId } = await params;
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id: bookingId }),
    select: { id: true },
  });
  if (!booking) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  try {
    const result = await withSpan(
      'api.admin.bookingItems.create',
      { bookingId, actorId: session.user.id, type: parsed.data.type },
      () => prisma.$transaction(async (tx) => {
      if (parsed.data.type === 'catalog') {
        const { productId, quantity } = parsed.data;
        // Lock the product row to serialize concurrent stock decrements.
        const locked = await tx.$queryRaw<Array<{
          id: string; stock: number; price: unknown; name: string;
          brand: string | null; reference: string | null;
          available: boolean; isArchived: boolean;
        }>>`
          SELECT id, stock, price, name, brand, reference, available, "isArchived"
          FROM "Product"
          WHERE id = ${productId}
          FOR UPDATE
        `;
        const product = locked[0];
        if (!product) throw new Error('PRODUCT_NOT_FOUND');
        if (product.isArchived || !product.available) throw new Error('PRODUCT_UNAVAILABLE');
        if (product.stock < quantity) throw new Error('INSUFFICIENT_STOCK');

        const unitPrice = toNumber(product.price as never);
        const total = Number((unitPrice * quantity).toFixed(2));
        const descParts = [product.name];
        if (product.brand) descParts.push(product.brand);
        const description = descParts.join(' · ');

        const item = await tx.bookingItem.create({
          data: {
            bookingId,
            productId,
            description,
            quantity,
            unitPrice: new Prisma.Decimal(unitPrice),
            total: new Prisma.Decimal(total),
            category: 'PRODUCT',
          },
        });

        await tx.product.update({
          where: { id: productId },
          data: { stock: { decrement: quantity } },
        });

        await tx.actionLog.create({
          data: {
            userId: session.user.id,
            action: 'BOOKING_ITEM_ADDED_FROM_CATALOG',
            entityType: 'BOOKING_ITEM',
            entityId: item.id,
            details: JSON.stringify({
              bookingId, productId, productName: product.name,
              quantity, unitPrice, stockAfter: product.stock - quantity,
            }),
          },
        });

        return item;
      }

      // type === 'free'
      const { description, category, quantity, unitPrice } = parsed.data;
      // DISCOUNT must produce a non-positive total (rebate, not a charge).
      if (category === 'DISCOUNT' && unitPrice > 0) {
        throw new Error('DISCOUNT_MUST_BE_NEGATIVE');
      }
      const total = Number((unitPrice * quantity).toFixed(2));

      const item = await tx.bookingItem.create({
        data: {
          bookingId,
          description,
          quantity,
          unitPrice: new Prisma.Decimal(unitPrice),
          total: new Prisma.Decimal(total),
          category,
        },
      });

      await tx.actionLog.create({
        data: {
          userId: session.user.id,
          action: 'BOOKING_ITEM_ADDED_FREE',
          entityType: 'BOOKING_ITEM',
          entityId: item.id,
          details: JSON.stringify({ bookingId, description, category, quantity, unitPrice }),
        },
      });

      return item;
    }),
    );

    return NextResponse.json(serializeItem(result), { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    if (
      msg === 'PRODUCT_NOT_FOUND' ||
      msg === 'PRODUCT_UNAVAILABLE' ||
      msg === 'INSUFFICIENT_STOCK' ||
      msg === 'DISCOUNT_MUST_BE_NEGATIVE'
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
