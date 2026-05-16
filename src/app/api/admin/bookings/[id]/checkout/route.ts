import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { toNumber } from '@/lib/decimal';
import { getPensionPrice, getPricingSettings } from '@/lib/pricing';
import { isPaidExceedsCheckViolation, PAID_EXCEEDS_PAYLOAD } from '@/lib/billing-errors';
import { withSpan, logServerError } from '@/lib/observability';
import { invalidateAvailabilityCache } from '@/lib/availability-cache';
import { differenceInCalendarDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { notDeleted } from '@/lib/prisma-soft';

interface Params { params: Promise<{ id: string }> }

const CASA_TZ = 'Africa/Casablanca';

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
    where: notDeleted({ id: bookingId }),
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

  // Nuits réelles = différence en jours calendaires Casablanca (jamais en
  // arithmétique milliseconde — DST/changement d'heure légale + édge cases
  // ramadan = drift d'une nuit). Minimum 1 nuit (séjour intraday compté 1).
  const realNights = Math.max(
    1,
    differenceInCalendarDays(
      toZonedTime(endDate, CASA_TZ),
      toZonedTime(booking.startDate, CASA_TZ),
    ),
  );

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
    await withSpan(
      'api.booking.checkout',
      { entityId: bookingId, userId: session.user.id, realNights, amount: toNumber(newInvoiceAmount), pets: booking.bookingPets.length },
      () => prisma.$transaction(async (tx) => {
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

        // Note: le trigger PG `trg_recompute_invoice_amount` recompute déjà
        // Invoice.amount = SUM(items.total) après les mutations sur InvoiceItem.
        // NE PAS écrire `amount` manuellement (drift garanti).
        // eslint-disable-next-line dog-universe/no-direct-invoice-mutation -- OK: optimistic-lock version bump only, no money field touched ; trigger trg_recompute_invoice_amount already handles amount.
        await tx.invoice.update({
          where: { id: booking.invoice.id },
          data: {
            version: { increment: 1 },
          },
        });
      }
    }),
    );

    // Booking passes to COMPLETED + endDate locked → availability cache stale.
    await invalidateAvailabilityCache(booking.startDate, endDate);

    return NextResponse.json({
      success: true,
      bookingId,
      endDate: endDate.toISOString(),
      realNights,
      invoiceAmount: toNumber(newInvoiceAmount),
    });
  } catch (err) {
    // H10 — paidAmount > new total after BOARDING items rewrite.
    if (isPaidExceedsCheckViolation(err)) {
      return NextResponse.json(PAID_EXCEEDS_PAYLOAD, { status: 409 });
    }
    logServerError('booking-checkout', 'checkout failed', err, { bookingId });
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
