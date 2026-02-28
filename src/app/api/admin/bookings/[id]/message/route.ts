import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { createAdminMessageNotification } from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';

interface Params { params: { id: string } }

export async function POST(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { messageFr, messageEn } = await request.json();
  if (!messageFr?.trim()) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    include: {
      client: { select: { id: true, name: true, email: true, language: true } },
    },
  });

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await createAdminMessageNotification(
    booking.client.id,
    messageFr,
    messageEn || messageFr
  );

  const locale = booking.client.language ?? 'fr';
  const message = locale === 'fr' ? messageFr : (messageEn || messageFr);
  const bookingRef = booking.id.slice(0, 8).toUpperCase();

  const { subject, html } = getEmailTemplate(
    'admin_message',
    { clientName: booking.client.name, message, bookingRef },
    locale
  );
  await sendEmail({ to: booking.client.email, subject, html });

  return NextResponse.json({ success: true });
}
