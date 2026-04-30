import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { uploadFile } from '@/lib/upload';
import { createStayPhotoNotification } from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { logAction, LOG_ACTIONS } from '@/lib/log';

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const photos = await prisma.stayPhoto.findMany({
    where: { bookingId: id },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  return NextResponse.json(photos);
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: id, deletedAt: null },
    include: {
      client: { select: { id: true, name: true, email: true, language: true } },
      bookingPets: { include: { pet: { select: { name: true } } } },
    },
  });

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const caption = (formData.get('caption') as string)?.trim().slice(0, 500) || undefined;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const result = await uploadFile(file, 'stay-photo');

  const photo = await prisma.stayPhoto.create({
    data: {
      bookingId: id,
      url: result.url,
      caption,
    },
  });

  // Notify client
  const petName = booking.bookingPets[0]?.pet.name ?? 'votre animal';
  const bookingRef = booking.id.slice(0, 8).toUpperCase();

  await createStayPhotoNotification(booking.client.id, petName, bookingRef, booking.id);

  // Non-blocking — photo is already saved; email failure must not cause a false 500
  const locale = booking.client.language ?? 'fr';
  const { subject, html } = getEmailTemplate(
    'stay_photo',
    { clientName: booking.client.name ?? booking.client.email, petName, bookingRef },
    locale
  );
  sendEmail({ to: booking.client.email, subject, html }).catch(() => {});

  return NextResponse.json(photo, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { photoId } = await request.json();
  if (!photoId) return NextResponse.json({ error: 'photoId required' }, { status: 400 });

  // Capture URL before delete so the audit log can record what was removed.
  const photo = await prisma.stayPhoto.findFirst({
    where: { id: photoId, bookingId: id },
    select: { id: true, url: true, caption: true },
  });
  if (!photo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.stayPhoto.delete({ where: { id: photoId } });

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.STAY_PHOTO_DELETED,
    entityType: 'StayPhoto',
    entityId: photoId,
    details: { bookingId: id, url: photo.url, caption: photo.caption ?? null },
  });

  return NextResponse.json({ success: true });
}
