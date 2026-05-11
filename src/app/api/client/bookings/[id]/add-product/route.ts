import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { toNumber } from '@/lib/decimal';
import { resolveItemCategory } from '@/lib/billing';
import { logger } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const { id: bookingId } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== 'CLIENT') {
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
  if (!productId || !Number.isInteger(quantity) || quantity <= 0 || quantity > 100) {
    return NextResponse.json({ error: 'INVALID_PARAMS' }, { status: 400 });
  }

  // Verify booking belongs to this client and is in a state that allows product orders
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, clientId: session.user.id, deletedAt: null },
    select: {
      id: true,
      status: true,
      bookingPets: { select: { pet: { select: { name: true } } } },
      invoice: { select: { id: true, status: true, amount: true } },
    },
  });
  if (!booking) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (!['CONFIRMED', 'IN_PROGRESS'].includes(booking.status)) {
    return NextResponse.json({ error: 'BOOKING_NOT_ACTIVE' }, { status: 400 });
  }
  if (!booking.invoice) {
    return NextResponse.json({ error: 'NO_INVOICE' }, { status: 400 });
  }
  if (booking.invoice.status === 'CANCELLED') {
    return NextResponse.json({ error: 'INVOICE_CANCELLED' }, { status: 400 });
  }
  const invoiceId = booking.invoice.id;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // SELECT ... FOR UPDATE — lock the product row to prevent concurrent stock
      // decrement races (two clients adding the last unit at the same time).
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
      if (!product || !product.available) throw new Error('PRODUCT_UNAVAILABLE');
      if (product.stock < quantity) throw new Error('OUT_OF_STOCK');

      const unitPrice = toNumber(product.price as never);
      const total = Number((unitPrice * quantity).toFixed(2));
      const descParts = [product.name];
      if (product.brand) descParts.push(product.brand);
      if (product.reference) descParts.push(`réf. ${product.reference}`);

      const item = await tx.invoiceItem.create({
        data: {
          invoiceId,
          description: descParts.join(' · '),
          quantity,
          unitPrice: new Prisma.Decimal(unitPrice),
          total: new Prisma.Decimal(total),
          productId,
          // Règle verrouillée : productId présent ⇒ PRODUCT obligatoire.
          category: resolveItemCategory(productId, 'PRODUCT'),
        },
      });

      const newStock = product.stock - quantity;
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

      return { item, productName: product.name, quantity, bookingId };
    });

    // Notify admins (non-blocking)
    const clientName = session.user.name ?? 'Client';
    const petNames = booking.bookingPets.map((bp) => bp.pet?.name).filter(Boolean).join(', ') || 'animal';
    import('@/lib/notifications').then(({ notifyAdminsProductOrder }) =>
      notifyAdminsProductOrder({ clientName, productName: result.productName, quantity, bookingId, petNames }).catch(() => {})
    ).catch(() => {});

    return NextResponse.json({
      id: result.item.id,
      description: result.item.description,
      quantity: result.item.quantity,
      unitPrice: toNumber(result.item.unitPrice),
      total: toNumber(result.item.total),
      category: result.item.category,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    if (msg === 'PRODUCT_UNAVAILABLE' || msg === 'OUT_OF_STOCK') {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    logger.error('client-products', 'add product failed', { err: msg });
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
