import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { createAdminMessageNotification } from '@/lib/notifications';
import { getEmailTemplate } from '@/lib/email';
import { sendEmailNow } from '@/lib/notify-now';
import { notDeleted } from '@/lib/prisma-soft';
import { withSpan } from '@/lib/observability';

interface Params { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  return withSpan('api.admin.bookings.message', { entityId: id }, () => messageImpl(request, id));
}

async function messageImpl(request: NextRequest, id: string): Promise<Response> {
  const authResult = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (authResult.error) return authResult.error;
  const { session } = authResult;

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
    where: notDeleted({ id: id }),
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
  sendEmailNow({ to: booking.client.email, subject, html });

  return NextResponse.json({ success: true });
}
