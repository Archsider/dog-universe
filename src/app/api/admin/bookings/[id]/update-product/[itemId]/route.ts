import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { toNumber } from '@/lib/decimal';

interface Params { params: Promise<{ id: string; itemId: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id: bookingId, itemId } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  const parsed = body as { quantity?: unknown };
  const newQty = Number(parsed.quantity);
  if (!Number.isInteger(newQty) || newQty <= 0 || newQty > 1000) {
    return NextResponse.json({ error: 'INVALID_QUANTITY' }, { status: 400 });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, deletedAt: null },
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
      const product = await tx.product.findUnique({ where: { id: item.productId! } });
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

      if (totalDelta !== 0) {
        await tx.invoice.update({
          where: { id: booking.invoice!.id },
          data: { amount: { increment: new Prisma.Decimal(totalDelta) } },
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
    console.error(JSON.stringify({ level: 'error', service: 'booking-update-product', message: 'update product failed', err: msg }));
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
