import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';

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

  // ── Invoice merge: UPDATE existing invoice (never create supplementary) ──
  // new total = ancien_total + montant_extension
  // ancien_total = target invoice amount (or target.totalPrice if no invoice)
  // montant_extension = source invoice amount (or source.totalPrice if no invoice)
  const ancienTotal = target.invoice?.amount ?? target.totalPrice;
  const montantExtension = source.invoice?.amount ?? source.totalPrice;
  const newTotal = Math.round((ancienTotal + montantExtension) * 100) / 100;

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

    // 3. Handle invoices — always update existing, never create supplementary
    if (target.invoice && source.invoice) {
      // Both have invoices → merge source into target, delete source invoice
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
      // Delete source invoice
      await tx.invoiceItem.deleteMany({ where: { invoiceId: source.invoice.id } });
      await tx.invoice.delete({ where: { id: source.invoice.id } });
    } else if (!target.invoice && source.invoice) {
      // Only source has invoice → re-link to target
      await tx.invoice.update({
        where: { id: source.invoice.id },
        data: { bookingId: target.id, amount: newTotal },
      });
    }
    // If neither has an invoice or only target has invoice: just update target invoice amount
    if (target.invoice && !source.invoice) {
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
