import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';
import { calculateBoardingTotalForExtension, getPricingSettings } from '@/lib/pricing';

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { targetBookingId, sourceBookingId } = body;

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
        bookingPets: { include: { pet: true } },
      },
    }),
    prisma.booking.findUnique({
      where: { id: sourceBookingId },
      include: {
        invoice: true,
        boardingDetail: true,
        bookingPets: { include: { pet: true } },
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

  // Validate contiguity: target.endDate + 1 day must equal source.startDate
  if (!target.endDate) {
    return NextResponse.json({ error: 'TARGET_NO_END_DATE' }, { status: 400 });
  }

  const targetEndPlusOne = new Date(target.endDate);
  targetEndPlusOne.setUTCDate(targetEndPlusOne.getUTCDate() + 1);

  if (toDateStr(targetEndPlusOne) !== toDateStr(source.startDate)) {
    return NextResponse.json({
      error: 'DATES_NOT_CONTIGUOUS',
      details: {
        targetEnd: toDateStr(target.endDate),
        sourceStart: toDateStr(source.startDate),
      },
    }, { status: 400 });
  }

  const newEndDate = source.endDate ?? source.startDate;
  const newNights = Math.floor(
    (newEndDate.getTime() - target.startDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const pets = target.bookingPets.map(bp => bp.pet);
  const groomingPrice = target.boardingDetail?.groomingPrice ?? 0;
  const taxiAddonPrice = target.boardingDetail?.taxiAddonPrice ?? 0;

  const pricingSettings = await getPricingSettings();
  const newTotal = calculateBoardingTotalForExtension(
    pets,
    newNights,
    groomingPrice,
    taxiAddonPrice,
    pricingSettings,
  );

  // Pre-generate supplementary invoice number if needed (outside transaction to avoid count races)
  let suppInvoiceNumber: string | null = null;
  if (target.invoice?.status === 'PAID') {
    const deltaAmount = Math.round((newTotal - target.invoice.amount) * 100) / 100;
    if (deltaAmount > 0) {
      const year = new Date().getFullYear();
      for (let attempt = 0; attempt < 5; attempt++) {
        const count = await prisma.invoice.count();
        const candidate = `DU-${year}-${String(count + 1 + attempt).padStart(4, '0')}`;
        const taken = await prisma.invoice.findUnique({ where: { invoiceNumber: candidate } });
        if (!taken) { suppInvoiceNumber = candidate; break; }
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    // 1. Migrate StayPhotos from source to target (so photos aren't lost)
    await tx.stayPhoto.updateMany({
      where: { bookingId: source.id },
      data: { bookingId: target.id },
    });

    // 2. Migrate BookingItems from source to target
    await tx.bookingItem.updateMany({
      where: { bookingId: source.id },
      data: { bookingId: target.id },
    });

    // 3. Handle invoices
    if (source.invoice && !target.invoice) {
      // Source has invoice, target doesn't — re-link source invoice to target
      await tx.invoice.update({
        where: { id: source.invoice.id },
        data: { bookingId: target.id, amount: newTotal },
      });
    } else if (source.invoice && target.invoice) {
      // Both have invoices
      if (target.invoice.status === 'PAID') {
        // Target already paid — create supplementary for the delta
        const deltaAmount = Math.round((newTotal - target.invoice.amount) * 100) / 100;
        if (deltaAmount > 0 && suppInvoiceNumber) {
          const targetRef = target.id.slice(0, 8).toUpperCase();
          const sourcePaid = source.invoice.paidAmount;
          await tx.invoice.create({
            data: {
              invoiceNumber: suppInvoiceNumber,
              clientId: target.clientId,
              bookingId: null,
              supplementaryForBookingId: target.id,
              amount: deltaAmount,
              paidAmount: Math.min(sourcePaid, deltaAmount),
              status: sourcePaid >= deltaAmount ? 'PAID' : sourcePaid > 0 ? 'PARTIALLY_PAID' : 'PENDING',
              serviceType: 'BOARDING',
              notes: `EXTENSION_SURCHARGE:${target.id}`,
              items: {
                create: [{
                  description: `Supplément fusion séjour #${targetRef}`,
                  quantity: 1,
                  unitPrice: deltaAmount,
                  total: deltaAmount,
                }],
              },
            },
          });
        }
      } else {
        // Target is PENDING or PARTIALLY_PAID — merge amounts
        const newPaidAmount = Math.round(
          (target.invoice.paidAmount + source.invoice.paidAmount) * 100
        ) / 100;
        const newStatus =
          newPaidAmount >= newTotal ? 'PAID'
          : newPaidAmount > 0 ? 'PARTIALLY_PAID'
          : 'PENDING';
        await tx.invoice.update({
          where: { id: target.invoice.id },
          data: {
            amount: newTotal,
            paidAmount: newPaidAmount,
            status: newStatus,
            ...(newStatus === 'PAID' && !target.invoice.paidAt ? { paidAt: new Date() } : {}),
          },
        });
      }
      // Delete source invoice
      await tx.invoiceItem.deleteMany({ where: { invoiceId: source.invoice.id } });
      await tx.invoice.delete({ where: { id: source.invoice.id } });
    }
    // If no source invoice: nothing to do for invoices

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
    },
  });

  return NextResponse.json({
    message: 'merged',
    targetBookingId: target.id,
    newEndDate: newEndDate.toISOString().slice(0, 10),
    newTotal,
  });
}
