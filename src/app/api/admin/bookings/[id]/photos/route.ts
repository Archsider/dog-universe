import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { uploadFile } from '@/lib/upload';
import { createStayPhotoNotification } from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';

interface Params { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const photos = await prisma.stayPhoto.findMany({
    where: { bookingId: params.id },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(photos);
}

export async function POST(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    include: {
      client: { select: { id: true, name: true, email: true, language: true } },
      bookingPets: { include: { pet: { select: { name: true } } } },
    },
  });

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const caption = (formData.get('caption') as string) || undefined;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const result = await uploadFile(file, 'stay-photo');

  const photo = await prisma.stayPhoto.create({
    data: {
      bookingId: params.id,
      url: result.url,
      caption,
    },
  });

  // Notify client
  const petName = booking.bookingPets[0]?.pet.name ?? 'votre animal';
  const bookingRef = booking.id.slice(0, 8).toUpperCase();

  await createStayPhotoNotification(booking.client.id, petName, bookingRef, booking.id);

  const locale = booking.client.language ?? 'fr';
  const { subject, html } = getEmailTemplate(
    'stay_photo',
    { clientName: booking.client.name, petName, bookingRef },
    locale
  );
  await sendEmail({ to: booking.client.email, subject, html });

  return NextResponse.json(photo, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { photoId } = await request.json();
  if (!photoId) return NextResponse.json({ error: 'photoId required' }, { status: 400 });

  await prisma.stayPhoto.delete({ where: { id: photoId, bookingId: params.id } });

  return NextResponse.json({ success: true });
}
