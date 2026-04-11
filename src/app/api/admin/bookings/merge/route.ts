import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';
import { calculateBoardingBreakdown, getPricingSettings } from '@/lib/pricing';

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { targetBookingId, sourceBookingId, force } = body;

  if (!targetBookingId || !sourceBookingId) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }
  if (targetBookingId === sourceBookingId) {
    return NextResponse.json({ error: 'SAME_BOOKING' }, { status: 400 });
  }

  const [bookingA, bookingB] = await Promise.all([
    prisma.booking.findUnique({
      where: { id: targetBookingId },
      include: {
        invoice: true,
        boardingDetail: true,
        bookingPets: { include: { pet: { select: { id: true, name: true, species: true } } } },
      },
    }),
    prisma.booking.findUnique({
      where: { id: sourceBookingId },
      include: {
        invoice: true,
        boardingDetail: true,
        bookingPets: { include: { pet: { select: { id: true, name: true, species: true } } } },
      },
    }),
  ]);

  if (!bookingA || !bookingB) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  if (bookingA.serviceType !== 'BOARDING' || bookingB.serviceType !== 'BOARDING') {
    return NextResponse.json({ error: 'MERGE_BOARDING_ONLY' }, { status: 400 });
  }

  if (bookingA.clientId !== bookingB.clientId) {
    return NextResponse.json({ error: 'DIFFERENT_CLIENTS' }, { status: 400 });
  }

  const nonMergeable = ['CANCELLED', 'REJECTED'];
  if (nonMergeable.includes(bookingA.status) || nonMergeable.includes(bookingB.status)) {
    return NextResponse.json({ error: 'BOOKING_NOT_MERGEABLE' }, { status: 400 });
  }

  // Determine which is earlier (target = earlier booking, source = later)
  let target = bookingA;
  let source = bookingB;
  if (bookingA.startDate > bookingB.startDate) {
    target = bookingB;
    source = bookingA;
  }

  if (!target.endDate) {
    return NextResponse.json({ error: 'TARGET_NO_END_DATE' }, { status: 400 });
  }

  // Validate contiguity unless force=true:
  // New rule: target.endDate === source.startDate (same day — checkout = checkin)
  // Legacy rule also accepted: target.endDate + 1 day === source.startDate
  if (!force) {
    const targetEndStr = toDateStr(target.endDate);
    const sourceStartStr = toDateStr(source.startDate);

    const targetEndPlusOne = new Date(target.endDate);
    targetEndPlusOne.setUTCDate(targetEndPlusOne.getUTCDate() + 1);
    const targetEndPlusOneStr = toDateStr(targetEndPlusOne);

    const sameDayContiguous = targetEndStr === sourceStartStr;
    const nextDayContiguous = targetEndPlusOneStr === sourceStartStr;

    if (!sameDayContiguous && !nextDayContiguous) {
      return NextResponse.json({
        error: 'DATES_NOT_CONTIGUOUS',
        details: {
          targetEnd: targetEndStr,
          sourceStart: sourceStartStr,
        },
      }, { status: 400 });
    }
  }

  const newEndDate = source.endDate ?? source.startDate;

  // ── Pre-compute merged boarding detail (taxi addons: OR of both) ──────────
  // Taxi Aller typically on target (start of stay), Retour on source (end).
  // After merge, the consolidated booking should carry both flags.
  const mergedTaxiGoEnabled =
    (target.boardingDetail?.taxiGoEnabled ?? false) || (source.boardingDetail?.taxiGoEnabled ?? false);
  const mergedTaxiReturnEnabled =
    (target.boardingDetail?.taxiReturnEnabled ?? false) || (source.boardingDetail?.taxiReturnEnabled ?? false);

  // Pre-compute new nights and items for invoice regeneration
  const pricing = await getPricingSettings();
  const newNights = Math.max(
    0,
    Math.floor((newEndDate.getTime() - target.startDate.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const pets = target.bookingPets.map(bp => bp.pet);

  // Build grooming map (only for target's boarding detail — grooming is a single event)
  const groomingMap: Record<string, 'SMALL' | 'LARGE'> = {};
  if (target.boardingDetail?.includeGrooming && target.boardingDetail.groomingSize) {
    const dogs = pets.filter(p => p.species === 'DOG');
    dogs.forEach(dog => {
      groomingMap[dog.id] = target.boardingDetail!.groomingSize as 'SMALL' | 'LARGE';
    });
  }

  const breakdown = calculateBoardingBreakdown(
    newNights,
    pets,
    target.boardingDetail?.includeGrooming ? groomingMap : undefined,
    mergedTaxiGoEnabled,
    mergedTaxiReturnEnabled,
    pricing,
  );

  // New total derived from recalculated breakdown — authoritative for BOARDING merges
  const newTotal = Math.round(breakdown.total * 100) / 100;

  await prisma.$transaction(async (tx) => {
    // 1. Migrate StayPhotos from source to target
    await tx.stayPhoto.updateMany({
      where: { bookingId: source.id },
      data: { bookingId: target.id },
    });

    // 2. Migrate BookingItems from source to target
    await tx.bookingItem.updateMany({
      where: { bookingId: source.id },
      data: { bookingId: target.id },
    });

    // 2b. Merge taxi addon flags from source's boardingDetail into target's
    //     (e.g. Retour on source + Aller on target → both enabled on merged booking)
    if (target.boardingDetail) {
      const taxiAddonPrice =
        (mergedTaxiGoEnabled ? pricing.taxi_standard : 0) +
        (mergedTaxiReturnEnabled ? pricing.taxi_standard : 0);
      await tx.boardingDetail.update({
        where: { bookingId: target.id },
        data: {
          taxiGoEnabled: mergedTaxiGoEnabled,
          taxiReturnEnabled: mergedTaxiReturnEnabled,
          taxiAddonPrice,
          // Copy source taxi dates when target didn't have that leg
          ...(source.boardingDetail?.taxiGoEnabled && !target.boardingDetail.taxiGoEnabled
            ? {
                taxiGoDate: source.boardingDetail.taxiGoDate,
                taxiGoTime: source.boardingDetail.taxiGoTime,
                taxiGoAddress: source.boardingDetail.taxiGoAddress,
              }
            : {}),
          ...(source.boardingDetail?.taxiReturnEnabled && !target.boardingDetail.taxiReturnEnabled
            ? {
                taxiReturnDate: source.boardingDetail.taxiReturnDate,
                taxiReturnTime: source.boardingDetail.taxiReturnTime,
                taxiReturnAddress: source.boardingDetail.taxiReturnAddress,
              }
            : {}),
        },
      });
    }

    // 3. Handle invoices — always update existing, never create supplementary
    if (target.invoice && source.invoice) {
      // Both have invoices → merge paidAmounts, regenerate items, delete source invoice
      const newPaidAmount = Math.round(
        (target.invoice.paidAmount + source.invoice.paidAmount) * 100
      ) / 100;
      const newStatus =
        newPaidAmount >= newTotal ? 'PAID'
        : newPaidAmount > 0 ? 'PARTIALLY_PAID'
        : 'PENDING';

      // Regenerate invoice items from the merged breakdown
      await tx.invoiceItem.deleteMany({ where: { invoiceId: target.invoice.id } });
      await tx.invoiceItem.createMany({
        data: breakdown.items.map(item => ({
          invoiceId: target.invoice!.id,
          description: item.descriptionFr,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        })),
      });

      await tx.invoice.update({
        where: { id: target.invoice.id },
        data: {
          amount: newTotal,
          paidAmount: newPaidAmount,
          status: newStatus,
          ...(newStatus === 'PAID' && !target.invoice.paidAt ? { paidAt: new Date() } : {}),
        },
      });
      // Delete source invoice
      await tx.invoiceItem.deleteMany({ where: { invoiceId: source.invoice.id } });
      await tx.invoice.delete({ where: { id: source.invoice.id } });
    } else if (!target.invoice && source.invoice) {
      // Only source has invoice → re-link to target, regenerate items
      await tx.invoiceItem.deleteMany({ where: { invoiceId: source.invoice.id } });
      await tx.invoiceItem.createMany({
        data: breakdown.items.map(item => ({
          invoiceId: source.invoice!.id,
          description: item.descriptionFr,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        })),
      });
      await tx.invoice.update({
        where: { id: source.invoice.id },
        data: { bookingId: target.id, amount: newTotal },
      });
    } else if (target.invoice && !source.invoice) {
      // Only target has invoice → regenerate items with new dates/taxi
      await tx.invoiceItem.deleteMany({ where: { invoiceId: target.invoice.id } });
      await tx.invoiceItem.createMany({
        data: breakdown.items.map(item => ({
          invoiceId: target.invoice!.id,
          description: item.descriptionFr,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        })),
      });
      const newStatus =
        target.invoice.paidAmount >= newTotal ? 'PAID'
        : target.invoice.paidAmount > 0 ? 'PARTIALLY_PAID'
        : 'PENDING';
      await tx.invoice.update({
        where: { id: target.invoice.id },
        data: {
          amount: newTotal,
          status: newStatus,
        },
      });
    }

    // 4. Update target booking (extend dates + total)
    await tx.booking.update({
      where: { id: target.id },
      data: {
        endDate: newEndDate,
        totalPrice: newTotal,
        hasExtensionRequest: false,
        extensionRequestedEndDate: null,
        extensionRequestNote: null,
      },
    });

    // 5. Delete source booking (cascades: BookingPets, BoardingDetail, TaxiDetail, remaining items)
    await tx.booking.delete({ where: { id: source.id } });
  });

  await logAction({
    userId: session.user.id,
    action: 'BOOKING_MERGED',
    entityType: 'Booking',
    entityId: target.id,
    details: {
      mergedBookingId: source.id,
      newEndDate: newEndDate.toISOString().slice(0, 10),
      newTotal,
      force: force ?? false,
    },
  });

  return NextResponse.json({
    message: 'merged',
    targetBookingId: target.id,
    newEndDate: newEndDate.toISOString().slice(0, 10),
    newTotal,
  });
}
