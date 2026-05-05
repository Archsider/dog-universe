import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { toNumber } from '@/lib/decimal';

interface Params { params: Promise<{ id: string }> }

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Closes an open-ended booking ("Clôturer le séjour"):
 *   - sets endDate = chosenDateTime
 *   - flips isOpenEnded → false
 *   - status → COMPLETED
 *   - recomputes the invoice total = real_nights × pricePerNight + sum(other items)
 *
 * The invoice PDF is regenerated on demand via `/api/invoices/[id]/pdf`,
 * so no eager render is needed here — the recomputed amount is enough to
 * mark the invoice as final.
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
  const parsed = body as { endDate?: unknown };
  if (typeof parsed.endDate !== 'string') {
    return NextResponse.json({ error: 'INVALID_END_DATE' }, { status: 400 });
  }
  const endDate = new Date(parsed.endDate);
  if (Number.isNaN(endDate.getTime())) {
    return NextResponse.json({ error: 'INVALID_END_DATE' }, { status: 400 });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, deletedAt: null },
    include: {
      boardingDetail: true,
      invoice: { include: { items: true } },
    },
  });

  if (!booking) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (!booking.isOpenEnded) {
    return NextResponse.json({ error: 'NOT_OPEN_ENDED' }, { status: 400 });
  }
  if (endDate.getTime() < booking.startDate.getTime()) {
    return NextResponse.json({ error: 'END_BEFORE_START' }, { status: 400 });
  }

  // Real nights count = ceil((endDate - startDate) / day) — partial days count as 1.
  const diffMs = endDate.getTime() - booking.startDate.getTime();
  const realNights = Math.max(1, Math.ceil(diffMs / MS_PER_DAY));

  const pricePerNight = booking.boardingDetail
    ? toNumber(booking.boardingDetail.pricePerNight)
    : 0;
  const boardingTotal = Number((realNights * pricePerNight).toFixed(2));

  let nonBoardingItemsTotal = 0;
  let boardingItemId: string | null = null;
  if (booking.invoice) {
    for (const item of booking.invoice.items) {
      if (item.category === 'BOARDING' && boardingItemId === null) {
        boardingItemId = item.id;
        continue;
      }
      nonBoardingItemsTotal += toNumber(item.total);
    }
  }
  const newInvoiceAmount = Number((boardingTotal + nonBoardingItemsTotal).toFixed(2));

  try {
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          endDate,
          isOpenEnded: false,
          status: 'COMPLETED',
          version: { increment: 1 },
        },
      });

      if (booking.invoice) {
        // Update or create the boarding line so its total reflects the real nights.
        if (boardingItemId) {
          await tx.invoiceItem.update({
            where: { id: boardingItemId },
            data: {
              quantity: realNights,
              unitPrice: new Prisma.Decimal(pricePerNight),
              total: new Prisma.Decimal(boardingTotal),
            },
          });
        } else if (boardingTotal > 0) {
          await tx.invoiceItem.create({
            data: {
              invoiceId: booking.invoice.id,
              description: `Pension (${realNights} nuit${realNights > 1 ? 's' : ''})`,
              quantity: realNights,
              unitPrice: new Prisma.Decimal(pricePerNight),
              total: new Prisma.Decimal(boardingTotal),
              category: 'BOARDING',
            },
          });
        }

        await tx.invoice.update({
          where: { id: booking.invoice.id },
          data: {
            amount: new Prisma.Decimal(newInvoiceAmount),
            version: { increment: 1 },
          },
        });
      }
    });

    return NextResponse.json({
      success: true,
      bookingId,
      endDate: endDate.toISOString(),
      realNights,
      invoiceAmount: newInvoiceAmount,
    });
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      service: 'booking-checkout',
      message: 'checkout failed',
      bookingId,
      err: err instanceof Error ? err.message : String(err),
    }));
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
