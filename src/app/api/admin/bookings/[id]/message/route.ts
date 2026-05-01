import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { createAdminMessageNotification } from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';

interface Params { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { messageFr: rawFr, messageEn: rawEn } = await request.json();
  if (typeof rawFr !== 'string' || !rawFr.trim()) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 });
  }
  if (rawEn !== undefined && rawEn !== null && typeof rawEn !== 'string') {
    return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
  }
  const messageFr = rawFr.slice(0, 5000);
  const messageEn = typeof rawEn === 'string' ? rawEn.slice(0, 5000) : rawEn;

  const booking = await prisma.booking.findFirst({
    where: { id: id, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
    include: {
      client: { select: { id: true, name: true, email: true, language: true } },
    },
  });

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await createAdminMessageNotification(
    booking.client.id,
    messageFr,
    messageEn || messageFr,
    booking.id
  );

  const locale = booking.client.language ?? 'fr';
  const message = locale === 'fr' ? messageFr : (messageEn || messageFr);
  const bookingRef = booking.id.slice(0, 8).toUpperCase();

  const { subject, html } = getEmailTemplate(
    'admin_message',
    { clientName: booking.client.name, message, bookingRef },
    locale
  );
  sendEmail({ to: booking.client.email, subject, html }).catch(() => {});

  return NextResponse.json({ success: true });
}
