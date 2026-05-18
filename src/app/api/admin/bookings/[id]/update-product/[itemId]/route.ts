import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { toNumber } from '@/lib/decimal';
import { isPaidExceedsCheckViolation, PAID_EXCEEDS_PAYLOAD } from '@/lib/billing-errors';
import { logger } from '@/lib/logger';
import { notDeleted } from '@/lib/prisma-soft';

interface Params { params: Promise<{ id: string; itemId: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id: bookingId, itemId } = await params;
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  const parsed = body as { quantity?: unknown; bookingVersion?: unknown };
  const newQty = Number(parsed.quantity);
  if (!Number.isInteger(newQty) || newQty <= 0 || newQty > 1000) {
    return NextResponse.json({ error: 'INVALID_QUANTITY' }, { status: 400 });
  }
  // H9 — optional optimistic lock on Booking.version (opt-in via body).
  const expectedBookingVersion = Number.isInteger(parsed.bookingVersion)
    ? (parsed.bookingVersion as number)
    : null;

  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id: bookingId }),
    select: { invoice: { select: { id: true } } },
  });
  if (!booking) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (!booking.invoice) return NextResponse.json({ error: 'NO_INVOICE' }, { status: 400 });

  const item = await prisma.invoiceItem.findUnique({ where: { id: itemId } });
  if (!item || item.invoiceId !== booking.invoice.id) {
    return NextResponse.json({ error: 'ITEM_NOT_FOUND' }, { status: 404 });
  }
  if (item.category !== 'PRODUCT' || !item.productId) {
    return NextResponse.json({ error: 'NOT_A_PRODUCT_ITEM' }, { status: 400 });
  }

  const delta = newQty - item.quantity; // positive = need more stock, negative = return stock

  try {
    const result = await prisma.$transaction(async (tx) => {
      // H9 — Booking.version guard (only when caller opted in).
      if (expectedBookingVersion !== null) {
        const bumped = await tx.booking.updateMany({
          where: notDeleted({ id: bookingId, version: expectedBookingVersion }),
          data: { version: { increment: 1 } },
        });
        if (bumped.count === 0) {
          throw new Error('BOOKING_VERSION_MISMATCH');
        }
      }
      // SELECT ... FOR UPDATE — lock the product row so the stock check + decrement
      // are atomic versus concurrent requests touching the same product.
      const locked = await tx.$queryRaw<Array<{
        id: string; stock: number; available: boolean;
      }>>`
        SELECT id, stock, available
        FROM "Product"
        WHERE id = ${item.productId!}
        FOR UPDATE
      `;
      const product = locked[0];
      if (!product) throw new Error('PRODUCT_NOT_FOUND');

      // If we need more stock, check availability
      if (delta > 0) {
        if (!product.available) throw new Error('PRODUCT_UNAVAILABLE');
        if (product.stock < delta) throw new Error('OUT_OF_STOCK');
      }

      const unitPrice = toNumber(item.unitPrice);
      const newTotal = Number((unitPrice * newQty).toFixed(2));
      const oldTotal = toNumber(item.total);
      const totalDelta = newTotal - oldTotal;

      const updatedItem = await tx.invoiceItem.update({
        where: { id: itemId },
        data: {
          quantity: newQty,
          total: new Prisma.Decimal(newTotal),
        },
      });

      const newStock = product.stock - delta;
      await tx.product.update({
        where: { id: item.productId! },
        data: {
          stock: { decrement: delta },
          ...(newStock <= 0 ? { available: false } : {}),
          ...(!product.available && newStock > 0 ? { available: true } : {}),
        },
      });

      // Note: le trigger PG `trg_recompute_invoice_amount` recompute déjà
      // Invoice.amount = SUM(items.total) après UPDATE sur InvoiceItem.
      // NE PAS écrire `amount` manuellement (drift garanti).
      if (totalDelta !== 0) {
        // eslint-disable-next-line dog-universe/no-direct-invoice-mutation -- OK: optimistic-lock version bump only ; Invoice.amount recomputed by InvoiceItem UPDATE trigger.
        await tx.invoice.update({
          where: { id: booking.invoice!.id },
          data: { version: { increment: 1 } },
        });
      }

      return updatedItem;
    });

    return NextResponse.json({
      id: result.id,
      description: result.description,
      quantity: result.quantity,
      unitPrice: toNumber(result.unitPrice),
      total: toNumber(result.total),
      category: result.category,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    if (['PRODUCT_UNAVAILABLE', 'OUT_OF_STOCK', 'PRODUCT_NOT_FOUND'].includes(msg)) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg === 'BOOKING_VERSION_MISMATCH') {
      return NextResponse.json(
        {
          error: 'BOOKING_VERSION_MISMATCH',
          message: 'La réservation a été modifiée entre-temps. Rechargez la page avant de relancer.',
        },
        { status: 409 },
      );
    }
    if (isPaidExceedsCheckViolation(err)) {
      return NextResponse.json(PAID_EXCEEDS_PAYLOAD, { status: 409 });
    }
    logger.error('booking-update-product', 'update product failed', { err: msg });
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
