import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { toNumber } from '@/lib/decimal';
import { getPensionPrice, getPricingSettings } from '@/lib/pricing';

interface Params { params: Promise<{ id: string }> }

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Closes an open-ended booking ("Clôturer le séjour"):
 *   - sets endDate = chosenDateTime
 *   - flips isOpenEnded → false
 *   - status → COMPLETED
 *   - recomputes one InvoiceItem BOARDING per pet (unitPrice via getPensionPrice),
 *     then sums into invoice.amount.
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
      bookingPets: { include: { pet: { select: { id: true, name: true, species: true } } } },
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

  // Tarif pension via getPensionPrice() — source unique de vérité.
  const pricingSettings = await getPricingSettings();
  const dogsCount = booking.bookingPets.filter((bp) => bp.pet.species === 'DOG').length;

  // Compute per-pet boarding lines.
  const boardingLines = booking.bookingPets.map((bp) => {
    const unitPrice = getPensionPrice(bp.pet, dogsCount, realNights, pricingSettings);
    const total = unitPrice.times(realNights);
    const speciesLabel = bp.pet.species === 'CAT' ? 'chat' : 'chien';
    return {
      petId: bp.pet.id,
      description: `Pension ${bp.pet.name} (${speciesLabel})`,
      quantity: realNights,
      unitPrice,
      total,
    };
  });
  const boardingTotal = boardingLines.reduce((acc, l) => acc.plus(l.total), new Prisma.Decimal(0));

  let nonBoardingItemsTotal = new Prisma.Decimal(0);
  if (booking.invoice) {
    for (const item of booking.invoice.items) {
      if (item.category === 'BOARDING') continue;
      nonBoardingItemsTotal = nonBoardingItemsTotal.plus(toNumber(item.total));
    }
  }
  const newInvoiceAmount = boardingTotal.plus(nonBoardingItemsTotal);

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
        // Replace all BOARDING items with the freshly computed per-pet lines.
        await tx.invoiceItem.deleteMany({
          where: { invoiceId: booking.invoice.id, category: 'BOARDING' },
        });
        if (boardingLines.length > 0) {
          await tx.invoiceItem.createMany({
            data: boardingLines.map((l) => ({
              invoiceId: booking.invoice!.id,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              total: l.total,
              category: 'BOARDING',
            })),
          });
        }

        await tx.invoice.update({
          where: { id: booking.invoice.id },
          data: {
            amount: newInvoiceAmount,
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
      invoiceAmount: toNumber(newInvoiceAmount),
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
