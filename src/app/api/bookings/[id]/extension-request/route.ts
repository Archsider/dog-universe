import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { notifyAdminsExtensionRequest } from '@/lib/notifications';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { requestedEndDate, note } = body as { requestedEndDate?: string; note?: string };

  if (!requestedEndDate) {
    return NextResponse.json({ error: 'requestedEndDate is required' }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
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

  const newDate = new Date(requestedEndDate + 'T12:00:00');
  if (isNaN(newDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }
  if (booking.endDate && newDate <= booking.endDate) {
    return NextResponse.json({ error: 'Requested date must be after current checkout date' }, { status: 400 });
  }
  if (newDate <= booking.startDate) {
    return NextResponse.json({ error: 'Requested date must be after start date' }, { status: 400 });
  }

  await prisma.booking.update({
    where: { id: params.id },
    data: {
      hasExtensionRequest: true,
      extensionRequestedEndDate: newDate,
      extensionRequestNote: note ? note.trim().slice(0, 500) : null,
    },
  });

  const bookingRef = booking.id.slice(0, 8).toUpperCase();
  const petNames = booking.bookingPets.map(bp => bp.pet.name).join(', ');
  const client = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true } });
  const clientName = client?.name ?? session.user.email ?? 'Client';
  const dateDisplay = newDate.toLocaleDateString('fr-MA');

  await notifyAdminsExtensionRequest(bookingRef, clientName, petNames, dateDisplay, params.id).catch(() => {});

  return NextResponse.json({ message: 'extension_request_submitted' });
}
