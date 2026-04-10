import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { createBookingValidationNotification, createBookingRefusalNotification } from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      taxiDetail: true,
      invoice: true,
    },
  });

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(booking);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { status, notes, endDate } = body;

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      invoice: { include: { items: true } },
    },
  });
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.booking.update({
    where: { id: params.id },
    data: {
      ...(status && { status }),
      ...(notes !== undefined && { notes }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
    },
  });

  // Handle invoice when admin extends BOARDING endDate
  if (
    endDate &&
    booking.serviceType === 'BOARDING' &&
    booking.endDate &&
    new Date(endDate).getTime() > booking.endDate.getTime()
  ) {
    const extensionNights = Math.floor(
      (new Date(endDate).getTime() - booking.endDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const ppu = booking.boardingDetail?.pricePerNight ?? 0;
    const deltaAmount = ppu > 0 ? ppu * extensionNights : 0;
    const inv = booking.invoice;

    if (inv && ppu > 0) {
      const petNamesStr = booking.bookingPets.map((bp) => bp.pet.name).join(', ');
      if (inv.status === 'PENDING') {
        const pensionItem = inv.items.find((it) => it.description.startsWith('Pension'));
        if (pensionItem) {
          const newQty = pensionItem.quantity + extensionNights;
          await prisma.$transaction(async (tx) => {
            await tx.invoiceItem.update({
              where: { id: pensionItem.id },
              data: {
                description: `Pension ${petNamesStr} — ${newQty} nuit${newQty > 1 ? 's' : ''}`,
                quantity: newQty,
                total: ppu * newQty,
              },
            });
            await tx.invoice.update({
              where: { id: inv.id },
              data: { amount: inv.amount + deltaAmount },
            });
          });
        }
      } else if (inv.status === 'PAID' && deltaAmount > 0) {
        const count = await prisma.invoice.count();
        const year = new Date().getFullYear();
        const invNumber = `DU-${year}-${String(count + 1).padStart(4, '0')}`;
        await prisma.invoice.create({
          data: {
            invoiceNumber: invNumber,
            clientId: booking.clientId,
            bookingId: null,
            amount: deltaAmount,
            status: 'PENDING',
            notes: `Complément extension — Résa ${params.id.slice(0, 8).toUpperCase()}`,
            items: {
              create: [
                {
                  description: `Extension pension ${petNamesStr} — ${extensionNights} nuit${extensionNights > 1 ? 's' : ''}`,
                  quantity: extensionNights,
                  unitPrice: ppu,
                  total: deltaAmount,
                },
              ],
            },
          },
        });
      }
    }
  }

  // Send notifications on status change
  if (status && status !== booking.status) {
    const userLang = booking.client.language || 'fr';
    const petNames = booking.bookingPets.map(bp => bp.pet.name).join(', ');
    const bookingRef = booking.id.slice(0, 8).toUpperCase();

    if (status === 'CONFIRMED') {
      const dates = booking.startDate.toLocaleDateString('fr-MA');
      await createBookingValidationNotification(booking.clientId, bookingRef, petNames, dates);
      const { subject, html } = getEmailTemplate('booking_confirmation', {
        clientName: booking.client.name,
        bookingRef,
        service: booking.serviceType === 'BOARDING' ? (userLang === 'fr' ? 'Pension' : 'Boarding') : 'Pet Taxi',
        petName: petNames,
      }, userLang);
      await sendEmail({ to: booking.client.email, subject, html });

      await logAction({
        userId: session.user.id,
        action: LOG_ACTIONS.BOOKING_CONFIRMED,
        entityType: 'Booking',
        entityId: params.id,
        details: { from: booking.status, to: status },
      });
    } else if (status === 'REJECTED' || status === 'CANCELLED') {
      await createBookingRefusalNotification(booking.clientId, bookingRef, petNames);
      const { subject, html } = getEmailTemplate('booking_refused', {
        clientName: booking.client.name,
        bookingRef,
        petName: petNames,
      }, userLang);
      await sendEmail({ to: booking.client.email, subject, html });

      await logAction({
        userId: session.user.id,
        action: status === 'REJECTED' ? LOG_ACTIONS.BOOKING_REJECTED : LOG_ACTIONS.BOOKING_CANCELLED,
        entityType: 'Booking',
        entityId: params.id,
        details: { from: booking.status, to: status },
      });
    } else {
      await logAction({
        userId: session.user.id,
        action: LOG_ACTIONS.BOOKING_COMPLETED,
        entityType: 'Booking',
        entityId: params.id,
        details: { from: booking.status, to: status },
      });
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const booking = await prisma.booking.findUnique({ where: { id: params.id } });
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    // BookingPets, BoardingDetail, TaxiDetail cascade from Booking
    // Invoice items cascade from Invoice
    const invoice = await tx.invoice.findUnique({ where: { bookingId: params.id } });
    if (invoice) {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.invoice.delete({ where: { id: invoice.id } });
    }
    await tx.booking.delete({ where: { id: params.id } });
  });

  await logAction({
    userId: session.user.id,
    action: 'BOOKING_DELETED',
    entityType: 'Booking',
    entityId: params.id,
    details: { status: booking.status, clientId: booking.clientId },
  });

  return NextResponse.json({ message: 'deleted' });
}
