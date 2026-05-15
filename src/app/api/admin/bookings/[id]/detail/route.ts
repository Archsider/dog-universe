// GET /api/admin/bookings/[id]/detail — admin only.
// Returns BookingDetail shape for the side panel (client-side navigation between bookings).
import { NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/decimal';
import { getPricingSettings } from '@/lib/pricing';
import { getPensionPriceNumber } from '@/lib/pricing-rules';
import { differenceInCalendarDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { BookingDetail } from '@/types/booking-detail';
import { notDeleted } from '@/lib/prisma-soft';

const CASA_TZ = 'Africa/Casablanca';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id }),
    include: {
      client: {
        select: { id: true, name: true, email: true, phone: true, isWalkIn: true },
      },
      bookingPets: {
        include: {
          pet: {
            select: {
              id: true,
              name: true,
              species: true,
              breed: true,
              photoUrl: true,
              gender: true,
              allergies: true,
              currentMedication: true,
              behaviorWithDogs: true,
              behaviorWithCats: true,
              notes: true,
            },
          },
        },
      },
      boardingDetail: true,
      taxiDetail: {
        select: { pickupAddress: true, dropoffAddress: true, price: true },
      },
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          amount: true,
          paidAmount: true,
          version: true,
        },
      },
    },
  });

  if (!booking) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Supplementary invoice (extension surcharge)
  const supplementaryInvoice = await prisma.invoice.findFirst({
    where: {
      OR: [
        { supplementaryForBookingId: id },
        { clientId: booking.clientId, notes: `EXTENSION_SURCHARGE:${id}` },
      ],
    },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      amount: true,
      paidAmount: true,
      version: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Last admin message for this booking — excludes soft-deleted so KPIs
  // don't surface a message the admin already retracted via the trash
  // icon on AdminMessageSection.
  const lastAdminMsg = await prisma.notification.findFirst({
    where: { userId: booking.clientId, type: 'ADMIN_MESSAGE', deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { messageFr: true, metadata: true },
  });
  const adminNotes: string | null = (() => {
    if (!lastAdminMsg?.metadata) return null;
    try {
      const meta = JSON.parse(lastAdminMsg.metadata) as Record<string, unknown>;
      return meta.bookingId === id ? (lastAdminMsg.messageFr ?? null) : null;
    } catch { return null; }
  })();

  // Action log — last 20 entries for this booking entity
  const rawLog = await prisma.actionLog.findMany({
    where: { entityType: 'booking', entityId: id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { user: { select: { name: true } } },
  });

  // Live total for open-ended stays
  let liveTotal: number | null = null;
  let liveNights: number | null = null;
  if (
    booking.isOpenEnded &&
    !['CANCELLED', 'REJECTED', 'COMPLETED'].includes(booking.status)
  ) {
    const pricing = await getPricingSettings();
    const nowCasa = toZonedTime(new Date(), CASA_TZ);
    const startCasa = toZonedTime(booking.startDate, CASA_TZ);
    const nights = Math.max(1, differenceInCalendarDays(nowCasa, startCasa));
    liveNights = nights;
    const dogs = booking.bookingPets.filter((bp) => bp.pet.species === 'DOG').length;
    liveTotal = booking.bookingPets.reduce(
      (sum, bp) =>
        sum + getPensionPriceNumber({ species: bp.pet.species }, dogs, nights, pricing) * nights,
      0,
    );
  }

  const detail: BookingDetail = {
    id: booking.id,
    status: booking.status as BookingDetail['status'],
    serviceType: booking.serviceType as BookingDetail['serviceType'],
    startDate: booking.startDate.toISOString(),
    endDate: booking.endDate?.toISOString() ?? null,
    isOpenEnded: booking.isOpenEnded,
    // booking.isWalkIn added in migration 20260512 — Prisma client regenerated on Vercel build
    isWalkIn: Boolean((booking as Record<string, unknown>).isWalkIn) || booking.client.isWalkIn,
    totalPrice: toNumber(booking.totalPrice),
    notes: booking.notes ?? null,
    cancellationReason: booking.cancellationReason ?? null,
    arrivalTime: booking.arrivalTime ?? null,
    version: booking.version,
    createdAt: booking.createdAt.toISOString(),

    client: {
      id: booking.client.id,
      name: booking.client.name ?? null,
      email: booking.client.email,
      phone: booking.client.phone ?? null,
      isWalkIn: booking.client.isWalkIn,
    },

    pets: booking.bookingPets.map((bp) => ({
      id: bp.pet.id,
      name: bp.pet.name,
      species: bp.pet.species as 'DOG' | 'CAT',
      breed: bp.pet.breed ?? null,
      photoUrl: bp.pet.photoUrl ?? null,
      gender: bp.pet.gender ?? null,
      allergies: bp.pet.allergies ?? null,
      currentMedication: bp.pet.currentMedication ?? null,
      behaviorWithDogs: bp.pet.behaviorWithDogs ?? null,
      behaviorWithCats: bp.pet.behaviorWithCats ?? null,
      notes: bp.pet.notes ?? null,
    })),

    invoice: booking.invoice
      ? {
          id: booking.invoice.id,
          invoiceNumber: booking.invoice.invoiceNumber,
          status: booking.invoice.status,
          amount: toNumber(booking.invoice.amount),
          paidAmount: toNumber(booking.invoice.paidAmount),
          version: booking.invoice.version,
        }
      : null,

    supplementaryInvoice: supplementaryInvoice
      ? {
          id: supplementaryInvoice.id,
          invoiceNumber: supplementaryInvoice.invoiceNumber,
          status: supplementaryInvoice.status,
          amount: toNumber(supplementaryInvoice.amount),
          paidAmount: toNumber(supplementaryInvoice.paidAmount),
          version: supplementaryInvoice.version,
        }
      : null,

    boarding: booking.boardingDetail
      ? {
          groomingEnabled: booking.boardingDetail.includeGrooming ?? false,
          groomingPrice: toNumber(booking.boardingDetail.groomingPrice) || null,
          taxiGoEnabled: booking.boardingDetail.taxiGoEnabled ?? false,
          taxiReturnEnabled: booking.boardingDetail.taxiReturnEnabled ?? false,
          pricePerNight: toNumber(booking.boardingDetail.pricePerNight) || null,
        }
      : null,

    taxi: booking.taxiDetail
      ? {
          pickupAddress: booking.taxiDetail.pickupAddress ?? null,
          dropoffAddress: booking.taxiDetail.dropoffAddress ?? null,
          price: booking.taxiDetail.price ? toNumber(booking.taxiDetail.price) : null,
        }
      : null,

    adminNotes,

    actionLog: rawLog.map((l) => ({
      id: l.id,
      action: l.action,
      details: l.details ?? null,
      createdAt: l.createdAt.toISOString(),
      userName: l.user?.name ?? null,
    })),

    liveTotal,
    liveNights,
  };

  return NextResponse.json(detail);
}
