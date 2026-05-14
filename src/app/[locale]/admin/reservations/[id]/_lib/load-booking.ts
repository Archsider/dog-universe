// Server-side data loader for the admin booking detail page.
// Centralises:
//   1. The 7-table Promise.all (booking + adjacent + extension + messages
//      + addon-requests + supplementary invoice + pending extension).
//   2. The "before / after" date-window computation that allows merging
//      adjacent BOARDING bookings.
//   3. The post-load JS-side filtering / shape transformation
//      (bookingMessages metadata scan, addon-request projection,
//      adjacent-booking summary).
//
// Returning a single object lets the page component focus on layout —
// no inline awaits, no Promise.all, no dictionary parsing.

import type { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';

export interface AdjacentBooking {
  id: string;
  startDate: Date;
  endDate: Date | null;
  totalPrice: number | Decimal;
  status: string;
  pets: string;
  relation: 'before' | 'after';
}

export interface ParsedAddonRequest {
  requestId: string;
  serviceType: 'PET_TAXI' | 'TOILETTAGE' | 'AUTRE';
  message: string;
  createdAt: string;
}

interface BookingMessage {
  id: string;
  messageFr: string;
  messageEn: string;
  createdAt: Date;
  metadata: string | null;
}

// Compute a [day-1, start-day] window for finding a booking ending the
// day before this one (or sharing the start day). Returns null when
// startDate is missing.
function computeBeforeWindow(startDate: Date | null): { gte: Date; lte: Date } | null {
  if (!startDate) return null;
  const startDayEnd = new Date(startDate);
  startDayEnd.setUTCHours(23, 59, 59, 999);
  const dayBefore = new Date(startDate);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const dayBeforeStart = new Date(dayBefore);
  dayBeforeStart.setUTCHours(0, 0, 0, 0);
  return { gte: dayBeforeStart, lte: startDayEnd };
}

function computeAfterWindow(endDate: Date | null): { gte: Date; lte: Date } | null {
  if (!endDate) return null;
  const endDayStart = new Date(endDate);
  endDayStart.setUTCHours(0, 0, 0, 0);
  const dayAfter = new Date(endDate);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
  const dayAfterEnd = new Date(dayAfter);
  dayAfterEnd.setUTCHours(23, 59, 59, 999);
  return { gte: endDayStart, lte: dayAfterEnd };
}

// Parse Notification.metadata.bookingId in JS — avoids the fragile
// JSONB substring scan that the route used to do via a Prisma `contains`
// (slow + false-positive on bookings whose ID is a prefix of another).
function filterMessagesForBooking(rows: BookingMessage[], bookingId: string): BookingMessage[] {
  return rows.filter((n) => {
    if (!n.metadata) return false;
    try {
      const parsed: unknown = JSON.parse(n.metadata);
      return (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed) &&
        (parsed as Record<string, unknown>).bookingId === bookingId
      );
    } catch {
      return false;
    }
  });
}

export async function loadAdminBookingDetail(id: string) {
  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id }),
    include: {
      client: { select: { id: true, name: true, email: true, phone: true, isWalkIn: true } },
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      taxiDetail: true,
      taxiTrips: {
        include: { history: { orderBy: { timestamp: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      },
      invoice: { include: { items: { orderBy: { id: 'asc' } } } },
      bookingItems: { orderBy: { id: 'asc' } },
      stayPhotos: { orderBy: { createdAt: 'desc' }, take: 200 },
    },
  });

  if (!booking) return null;

  const clientId = booking.client.id;
  const beforeWindow =
    booking.serviceType === 'BOARDING' ? computeBeforeWindow(booking.startDate) : null;
  const afterWindow =
    booking.serviceType === 'BOARDING' ? computeAfterWindow(booking.endDate ?? null) : null;

  // Seven independent reads in parallel — minimises RTT on a multi-AZ
  // pooler and lets Lambda warm up other layers while waiting.
  const [
    supplementaryInvoice,
    pendingExtensionBooking,
    originalBooking,
    before,
    after,
    rawBookingMessages,
    addonRequestRows,
  ] = await Promise.all([
    prisma.invoice.findFirst({
      where: {
        OR: [
          { supplementaryForBookingId: id },
          // legacy fallback for rows created before the FK column was added
          { clientId, notes: `EXTENSION_SURCHARGE:${id}` },
        ],
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.booking.findFirst({
      where: notDeleted({ extensionForBookingId: id, status: 'PENDING_EXTENSION' }),
      select: { id: true, startDate: true, endDate: true, totalPrice: true },
    }),
    booking.extensionForBookingId
      ? prisma.booking.findFirst({
          where: notDeleted({ id: booking.extensionForBookingId }),
          select: { id: true, startDate: true, endDate: true, totalPrice: true, status: true },
        })
      : Promise.resolve(null),
    beforeWindow
      ? prisma.booking.findFirst({
          where: notDeleted({
            id: { not: id },
            clientId,
            serviceType: 'BOARDING',
            status: { notIn: ['CANCELLED', 'REJECTED'] as ('CANCELLED' | 'REJECTED')[] },
            endDate: beforeWindow,
          }),
          include: { bookingPets: { include: { pet: true } } },
          orderBy: { startDate: 'desc' },
        })
      : Promise.resolve(null),
    afterWindow
      ? prisma.booking.findFirst({
          where: notDeleted({
            id: { not: id },
            clientId,
            serviceType: 'BOARDING',
            status: { notIn: ['CANCELLED', 'REJECTED'] as ('CANCELLED' | 'REJECTED')[] },
            startDate: afterWindow,
          }),
          include: { bookingPets: { include: { pet: true } } },
          orderBy: { startDate: 'asc' },
        })
      : Promise.resolve(null),
    prisma.notification.findMany({
      where: { userId: clientId, type: 'ADMIN_MESSAGE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, messageFr: true, messageEn: true, createdAt: true, metadata: true },
      take: 200,
    }),
    prisma.addonRequest.findMany({
      where: { bookingId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, serviceType: true, description: true, status: true, createdAt: true },
      take: 100,
    }),
  ]);

  const bookingMessages = filterMessagesForBooking(rawBookingMessages, id);

  const addonRequests: ParsedAddonRequest[] = addonRequestRows
    .filter(
      (r) =>
        r.serviceType === 'PET_TAXI' ||
        r.serviceType === 'TOILETTAGE' ||
        r.serviceType === 'AUTRE',
    )
    .map((r) => ({
      requestId: r.id,
      serviceType: r.serviceType as 'PET_TAXI' | 'TOILETTAGE' | 'AUTRE',
      message: r.description,
      createdAt: r.createdAt.toISOString(),
    }));

  const adjacentBookings: AdjacentBooking[] = [];
  if (before) {
    adjacentBookings.push({
      id: before.id,
      startDate: before.startDate,
      endDate: before.endDate,
      totalPrice: Number(before.totalPrice),
      status: before.status,
      pets: before.bookingPets.map((bp) => bp.pet.name).join(', '),
      relation: 'before',
    });
  }
  if (after) {
    adjacentBookings.push({
      id: after.id,
      startDate: after.startDate,
      endDate: after.endDate,
      totalPrice: Number(after.totalPrice),
      status: after.status,
      pets: after.bookingPets.map((bp) => bp.pet.name).join(', '),
      relation: 'after',
    });
  }

  return {
    booking,
    supplementaryInvoice,
    pendingExtensionBooking,
    originalBooking,
    bookingMessages,
    addonRequests,
    adjacentBookings,
  };
}

export type AdminBookingDetail = NonNullable<Awaited<ReturnType<typeof loadAdminBookingDetail>>>;
