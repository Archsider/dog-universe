import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { notifyAdminsExtensionRequest } from '@/lib/notifications';
import { bookingExtensionRequestSchema, formatZodError } from '@/lib/validation';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = bookingExtensionRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }
  const { requestedEndDate, note } = parsed.data;

  const booking = await prisma.booking.findFirst({
    where: { id: id, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
    include: { bookingPets: { include: { pet: true } } },
  });

  if (!booking || booking.clientId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (booking.serviceType !== 'BOARDING') {
    return NextResponse.json({ error: 'Extensions only apply to boarding stays' }, { status: 400 });
  }

  if (!['CONFIRMED', 'IN_PROGRESS'].includes(booking.status)) {
    return NextResponse.json({ error: 'Extensions can only be requested for confirmed or active stays' }, { status: 400 });
  }

  if (booking.hasExtensionRequest) {
    return NextResponse.json({ error: 'A pending extension request already exists' }, { status: 409 });
  }

  if (!booking.endDate) {
    return NextResponse.json({ error: 'Booking has no end date' }, { status: 400 });
  }

  const newEndDate = new Date(requestedEndDate + 'T12:00:00Z');
  if (isNaN(newEndDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  // Extension end date must be strictly after current end date
  if (newEndDate <= booking.endDate) {
    return NextResponse.json({ error: 'Requested date must be after current checkout date' }, { status: 400 });
  }

  // Extension start date = booking end date (same day — locked)
  const extensionStartDate = booking.endDate;
  const extensionStartStr = extensionStartDate.toISOString().slice(0, 10);
  const requestedEndStr = requestedEndDate;

  // Validate that the requested end date is actually after the extension start
  if (requestedEndStr <= extensionStartStr) {
    return NextResponse.json({
      error: `L'extension doit commencer le ${extensionStartStr}`,
    }, { status: 400 });
  }

  // Create the PENDING_EXTENSION booking
  const extensionBooking = await prisma.$transaction(async (tx) => {
    // Mark original booking as having a pending extension
    await tx.booking.update({
      where: { id: id },
      data: {
        hasExtensionRequest: true,
        extensionRequestedEndDate: newEndDate,
        extensionRequestNote: note ? note.trim().slice(0, 500) : null,
      },
    });

    // Create extension booking with PENDING_EXTENSION status
    const ext = await tx.booking.create({
      data: {
        clientId: booking.clientId,
        serviceType: 'BOARDING',
        status: 'PENDING_EXTENSION',
        startDate: extensionStartDate,
        endDate: newEndDate,
        totalPrice: 0,
        source: 'ONLINE',
        notes: note ? note.trim().slice(0, 500) : null,
        extensionForBookingId: id,
        // Copy pets from original booking
        bookingPets: {
          create: booking.bookingPets.map(bp => ({ petId: bp.petId })),
        },
      },
    });

    return ext;
  });

  const bookingRef = booking.id.slice(0, 8).toUpperCase();
  const petNames = booking.bookingPets.map(bp => bp.pet.name).join(', ');
  const client = await prisma.user.findFirst({ where: { id: session.user.id, deletedAt: null }, select: { name: true } }); // soft-delete: required — no global extension (Edge Runtime incompatible)
  const clientName = client?.name ?? session.user.email ?? 'Client';
  const dateDisplay = newEndDate.toLocaleDateString('fr-MA');

  await notifyAdminsExtensionRequest(bookingRef, clientName, petNames, dateDisplay, id).catch(() => {});

  return NextResponse.json({ message: 'extension_request_submitted', extensionBookingId: extensionBooking.id });
}
