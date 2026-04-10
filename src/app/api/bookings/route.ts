import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { createBookingConfirmationNotification } from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { formatDate } from '@/lib/utils';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const clientId = searchParams.get('clientId');

  const where: Record<string, unknown> = {};

  if (session.user.role === 'CLIENT') {
    where.clientId = session.user.id;
  } else if (clientId) {
    where.clientId = clientId;
  }

  if (status) where.status = status;

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      client: { select: { id: true, name: true, email: true } },
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      taxiDetail: true,
      invoice: { select: { id: true, invoiceNumber: true, status: true, amount: true } },
    },
    orderBy: { startDate: 'desc' },
  });

  return NextResponse.json(bookings);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const {
      serviceType,
      petIds,
      startDate,
      endDate,
      arrivalTime,
      notes,
      totalPrice,
      // Boarding specific
      includeGrooming,
      groomingSize,
      groomingPrice,
      pricePerNight,
      // Boarding taxi addon
      taxiGoEnabled,
      taxiGoDate,
      taxiGoTime,
      taxiGoAddress,
      taxiReturnEnabled,
      taxiReturnDate,
      taxiReturnTime,
      taxiReturnAddress,
      taxiAddonPrice,
      // Taxi specific
      taxiType,
    } = body;

    if (!serviceType || !petIds?.length || !startDate) {
      return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
    }

    // Verify pets belong to this client
    if (session.user.role === 'CLIENT') {
      const pets = await prisma.pet.findMany({
        where: { id: { in: petIds }, ownerId: session.user.id },
      });
      if (pets.length !== petIds.length) {
        return NextResponse.json({ error: 'INVALID_PETS' }, { status: 400 });
      }
    }

    // Generate booking reference
    const count = await prisma.booking.count();
    const year = new Date().getFullYear();
    const bookingRef = `DU-${year}-${String(count + 1).padStart(4, '0')}`;

    const clientId = session.user.role === 'CLIENT' ? session.user.id : body.clientId;

    // ── SAME-STAY DETECTION: pension extension → UPDATE instead of CREATE ──
    if (serviceType === 'BOARDING' && endDate) {
      const newStart = new Date(startDate);

      const sameStay = await prisma.booking.findFirst({
        where: {
          clientId,
          serviceType: 'BOARDING',
          status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
          endDate: newStart,
        },
        include: {
          bookingPets: true,
          boardingDetail: true,
          invoice: { include: { items: true } },
          client: true,
        },
      });

      if (sameStay) {
        const existingPetIds = sameStay.bookingPets.map((bp) => bp.petId).sort();
        const incomingPetIds = [...(petIds as string[])].sort();
        const samePets =
          existingPetIds.length === incomingPetIds.length &&
          existingPetIds.every((pid, i) => pid === incomingPetIds[i]);

        if (samePets) {
          const extensionNights = Math.floor(
            (new Date(endDate).getTime() - newStart.getTime()) / (1000 * 60 * 60 * 24)
          );
          const deltaAmount = totalPrice ?? 0;

          const extended = await prisma.booking.update({
            where: { id: sameStay.id },
            data: {
              endDate: new Date(endDate),
              totalPrice: sameStay.totalPrice + deltaAmount,
            },
            include: { bookingPets: { include: { pet: true } }, client: true },
          });

          // Billing: update PENDING invoice or create complement for PAID
          const inv = sameStay.invoice;
          if (inv) {
            const petNamesStr = extended.bookingPets.map((bp) => bp.pet.name).join(', ');
            const ppu = sameStay.boardingDetail?.pricePerNight ?? 0;

            if (inv.status === 'PENDING') {
              const pensionItem = inv.items.find((it) => it.description.startsWith('Pension'));
              if (pensionItem && ppu > 0) {
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
                    data: { amount: inv.amount + ppu * extensionNights },
                  });
                });
              } else if (deltaAmount > 0) {
                // pricePerNight unknown (0): update total amount only
                await prisma.invoice.update({
                  where: { id: inv.id },
                  data: { amount: inv.amount + deltaAmount },
                });
              }
            } else if (inv.status === 'PAID' && deltaAmount > 0) {
              // Create complementary invoice (bookingId=null: @unique on Invoice)
              const count = await prisma.invoice.count();
              const year = new Date().getFullYear();
              const invNumber = `DU-${year}-${String(count + 1).padStart(4, '0')}`;
              await prisma.invoice.create({
                data: {
                  invoiceNumber: invNumber,
                  clientId,
                  bookingId: null,
                  amount: deltaAmount,
                  status: 'PENDING',
                  notes: `Complément extension — Résa ${sameStay.id.slice(0, 8).toUpperCase()}`,
                  items: {
                    create: [
                      {
                        description: `Extension pension ${petNamesStr} — ${extensionNights} nuit${extensionNights > 1 ? 's' : ''}`,
                        quantity: extensionNights,
                        unitPrice: ppu > 0 ? ppu : Math.round(deltaAmount / Math.max(1, extensionNights)),
                        total: deltaAmount,
                      },
                    ],
                  },
                },
              });
            }
          }
          // No invoice → admin creates it after; nights on booking are now correct.

          const bookingRef = sameStay.id.slice(0, 8).toUpperCase();
          await logAction({
            userId: session.user.id,
            action: LOG_ACTIONS.BOOKING_CREATED,
            entityType: 'Booking',
            entityId: sameStay.id,
            details: { bookingRef, extended: true, newEndDate: endDate, extensionNights },
          });

          return NextResponse.json({ ...extended, bookingRef }, { status: 200 });
        }
      }
    }
    // ── END SAME-STAY DETECTION ──

    const booking = await prisma.booking.create({
      data: {
        clientId,
        serviceType,
        status: session.user.role === 'ADMIN' ? 'CONFIRMED' : 'PENDING',
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        arrivalTime: arrivalTime || null,
        notes: notes?.trim() || null,
        totalPrice: totalPrice ?? 0,
        bookingPets: {
          create: petIds.map((petId: string) => ({ petId })),
        },
      },
      include: {
        bookingPets: { include: { pet: true } },
        client: true,
      },
    });

    // Create service-specific details
    if (serviceType === 'BOARDING') {
      await prisma.boardingDetail.create({
        data: {
          bookingId: booking.id,
          includeGrooming: includeGrooming ?? false,
          groomingSize: groomingSize || null,
          groomingPrice: groomingPrice ?? 0,
          pricePerNight: pricePerNight ?? 0,
          taxiGoEnabled: taxiGoEnabled ?? false,
          taxiGoDate: taxiGoDate || null,
          taxiGoTime: taxiGoTime || null,
          taxiGoAddress: taxiGoAddress || null,
          taxiReturnEnabled: taxiReturnEnabled ?? false,
          taxiReturnDate: taxiReturnDate || null,
          taxiReturnTime: taxiReturnTime || null,
          taxiReturnAddress: taxiReturnAddress || null,
          taxiAddonPrice: taxiAddonPrice ?? 0,
        },
      });
    } else if (serviceType === 'PET_TAXI') {
      await prisma.taxiDetail.create({
        data: {
          bookingId: booking.id,
          taxiType: taxiType ?? 'STANDARD',
          price: totalPrice ?? 150,
        },
      });
    }

    // Send notifications and emails
    const petNames = booking.bookingPets.map((bp) => bp.pet.name).join(', ');
    const locale = booking.client.language ?? 'fr';

    await createBookingConfirmationNotification(
      booking.clientId,
      bookingRef,
      petNames
    );

    const serviceName = serviceType === 'BOARDING'
      ? (locale === 'fr' ? 'Pension' : 'Boarding')
      : (locale === 'fr' ? 'Taxi animalier' : 'Pet Taxi');

    const { subject, html } = getEmailTemplate('booking_confirmation', {
      clientName: booking.client.name,
      bookingRef,
      service: serviceName,
      petName: petNames,
    }, locale);

    await sendEmail({ to: booking.client.email, subject, html });

    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.BOOKING_CREATED,
      entityType: 'Booking',
      entityId: booking.id,
      details: { bookingRef, serviceType, totalPrice },
    });

    return NextResponse.json({ ...booking, bookingRef }, { status: 201 });
  } catch (error) {
    console.error('Create booking error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
