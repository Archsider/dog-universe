import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { toNumber } from '@/lib/decimal';
import { resolveItemCategory } from '@/lib/billing';

interface Params { params: Promise<{ id: string }> }

/**
 * Adds a product line to the open invoice of a booking.
 *
 * Atomic transaction:
 *   1) lock the product row (FOR UPDATE) and verify stock
 *   2) create the InvoiceItem (category PRODUCT) with description = "name [brand · ref]"
 *   3) decrement Product.stock by qty
 *   4) bump Invoice.amount by line total
 *
 * Returns the new InvoiceItem.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id: bookingId } = await params;
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
  const parsed = body as { productId?: unknown; quantity?: unknown };
  const productId = typeof parsed.productId === 'string' ? parsed.productId : '';
  const quantity = Number(parsed.quantity);
  if (!productId || !Number.isInteger(quantity) || quantity <= 0 || quantity > 1000) {
    return NextResponse.json({ error: 'INVALID_PARAMS' }, { status: 400 });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, deletedAt: null },
    select: { id: true, invoice: { select: { id: true, status: true, amount: true, version: true } } },
  });
  if (!booking) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (!booking.invoice) {
    return NextResponse.json({ error: 'NO_INVOICE' }, { status: 400 });
  }
  if (booking.invoice.status === 'CANCELLED') {
    return NextResponse.json({ error: 'INVOICE_CANCELLED' }, { status: 400 });
  }
  const invoiceId = booking.invoice.id;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // SELECT ... FOR UPDATE — lock the row to prevent concurrent stock decrement
      // races between two parallel "add product" requests. Without this lock, two
      // requests reading stock=1 simultaneously could both pass the check and over-sell.
      const locked = await tx.$queryRaw<Array<{
        id: string; stock: number; available: boolean; price: unknown;
        name: string; brand: string | null; reference: string | null;
      }>>`
        SELECT id, stock, available, price, name, brand, reference
        FROM "Product"
        WHERE id = ${productId}
        FOR UPDATE
      `;
      const product = locked[0];
      if (!product || !product.available) {
        throw new Error('PRODUCT_UNAVAILABLE');
      }
      if (product.stock < quantity) {
        throw new Error('OUT_OF_STOCK');
      }

      const unitPrice = toNumber(product.price as never);
      const total = Number((unitPrice * quantity).toFixed(2));
      const descParts = [product.name];
      if (product.brand) descParts.push(product.brand);
      if (product.reference) descParts.push(`réf. ${product.reference}`);
      const description = descParts.join(' · ');

      const item = await tx.invoiceItem.create({
        data: {
          invoiceId,
          description,
          quantity,
          unitPrice: new Prisma.Decimal(unitPrice),
          total: new Prisma.Decimal(total),
          productId,
          // Règle verrouillée : productId présent ⇒ PRODUCT obligatoire.
          category: resolveItemCategory(productId, 'PRODUCT'),
        },
      });

      const newStock = product.stock - quantity;
      // The row is held under FOR UPDATE; the decrement is therefore safe.
      await tx.product.update({
        where: { id: productId },
        data: {
          stock: { decrement: quantity },
          ...(newStock === 0 && { available: false }),
        },
      });

      await tx.invoice.update({
        where: { id: invoiceId },
        data: { amount: { increment: new Prisma.Decimal(total) } },
      });

      return item;
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
    if (msg === 'PRODUCT_UNAVAILABLE' || msg === 'OUT_OF_STOCK') {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error(JSON.stringify({ level: 'error', service: 'booking-products', message: 'add product failed', err: msg }));
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
