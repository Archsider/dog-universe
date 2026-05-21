import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
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
import { logger } from '@/lib/logger';
import { logAction, LOG_ACTIONS } from '@/lib/log';

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
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

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
  // Checkout est possible pour tout séjour physiquement présent (IN_PROGRESS),
  // qu'il soit open-ended (walk-in date inconnue) OU à dates fixes. Le
  // CloseStayDialog des "Départs du jour" cible des séjours normaux — l'ancien
  // garde `!isOpenEnded → 400` les bloquait (bug clôture impossible).
  if (booking.status !== 'IN_PROGRESS') {
    return NextResponse.json({ error: 'NOT_IN_PROGRESS' }, { status: 400 });
  }
  if (endDate.getTime() < booking.startDate.getTime()) {
    return NextResponse.json({ error: 'END_BEFORE_START' }, { status: 400 });
  }

  // Seuls les séjours open-ended recalculent la facture (les dates étaient
  // inconnues à la réservation → la clôture est le moment de tarification
  // canonique). Un séjour à dates fixes conserve sa facture déjà émise (avec
  // ses éventuelles remises) : l'admin a validé le montant à la réservation,
  // la clôture ne fait qu'enregistrer la date/heure réelle de sortie et passer
  // le statut à COMPLETED. Recalculer écraserait les remises (drift money path).
  const recomputeInvoice = booking.isOpenEnded;

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
  // Pour un séjour normal on ne recalcule pas : le montant final = facture
  // déjà émise (ou totalPrice si pas de facture legacy).
  const newInvoiceAmount = recomputeInvoice
    ? boardingTotal.plus(nonBoardingItemsTotal)
    : new Prisma.Decimal(toNumber(booking.invoice?.amount ?? booking.totalPrice));

  try {
    await withSpan(
      'api.booking.checkout',
      { entityId: bookingId, userId: session.user.id, realNights, amount: toNumber(newInvoiceAmount), pets: booking.bookingPets.length },
      () => prisma.$transaction(async (tx) => {
      // Optimistic lock — guards against double-checkout race :
      // Two admins clicking 'Clôturer' at the same time would both pass
      // the prior fetch and both run deleteMany/createMany on the items
      // (Invoice.amount recomputed twice, allocation rejoue, money drift).
      // With version in WHERE, the second tx throws P2025 caught below.
      const updated = await tx.booking.updateMany({
        where: { id: bookingId, version: booking.version },
        data: {
          endDate,
          isOpenEnded: false,
          status: 'COMPLETED',
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new Error('VERSION_CONFLICT');
      }

      if (recomputeInvoice && booking.invoice) {
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

    // Re-allocate payments on the now-updated invoice items so that
    // paidAmount / item.allocatedAmount / status / paidAt all reflect the
    // new BOARDING line breakdown.  Without this, partial-paid open-ended
    // walk-ins kept their old allocation against deleted items → dashboards
    // showed stale paid status and the trigger-recomputed `amount` no
    // longer matched the cached `paidAmount`.  Allocation opens its own
    // Serializable tx ; safe to run post-checkout commit.
    if (recomputeInvoice && booking.invoice) {
      try {
        const { allocatePayments } = await import('@/lib/payments');
        await allocatePayments(booking.invoice.id);
      } catch (err) {
        logger.error('booking-checkout', 'reallocate_failed', {
          invoiceId: booking.invoice.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Audit trail — money path requires it.  Until 2026-05-20 the
    // checkout flow committed without leaving any record beyond the
    // diff in the booking/invoice rows.  Now parity with walk-in /
    // payments / cancel.
    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.BOOKING_COMPLETED,
      entityType: 'Booking',
      entityId: bookingId,
      details: {
        previousStatus: 'IN_PROGRESS',
        endDate: endDate.toISOString(),
        realNights,
        boardingTotal: toNumber(boardingTotal),
        newInvoiceAmount: toNumber(newInvoiceAmount),
        invoiceId: booking.invoice?.id ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      bookingId,
      endDate: endDate.toISOString(),
      realNights,
      invoiceAmount: toNumber(newInvoiceAmount),
    });
  } catch (err) {
    // Optimistic lock — second concurrent checkout caught here.
    if (err instanceof Error && err.message === 'VERSION_CONFLICT') {
      return NextResponse.json({ error: 'VERSION_CONFLICT' }, { status: 409 });
    }
    // H10 — paidAmount > new total after BOARDING items rewrite.
    if (isPaidExceedsCheckViolation(err)) {
      return NextResponse.json(PAID_EXCEEDS_PAYLOAD, { status: 409 });
    }
    logServerError('booking-checkout', 'checkout failed', err, { bookingId });
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
