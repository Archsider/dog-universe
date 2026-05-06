import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { toNumber } from '@/lib/decimal';

interface Params { params: Promise<{ id: string; itemId: string }> }

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id: bookingId, itemId } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

  await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.delete({ where: { id: itemId } });

    await tx.invoice.update({
      where: { id: booking.invoice!.id },
      data: { amount: { decrement: new Prisma.Decimal(toNumber(item.total)) } },
    });

    // Restore stock; re-enable if was disabled by stock reaching 0
    const product = await tx.product.findUnique({ where: { id: item.productId! } });
    if (product) {
      const newStock = product.stock + item.quantity;
      await tx.product.update({
        where: { id: item.productId! },
        data: {
          stock: { increment: item.quantity },
          ...(!product.available && newStock > 0 ? { available: true } : {}),
        },
      });
    }
  });

  return new NextResponse(null, { status: 204 });
}
