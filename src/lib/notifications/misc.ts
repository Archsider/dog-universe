import { prisma } from '@/lib/prisma';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { NOTIFICATION_MESSAGES } from '@/lib/notification-messages';
import { createNotification, createAdminNotifications } from './core';
import { notDeleted } from '@/lib/prisma-soft';

export async function createInvoiceNotification(
  userId: string,
  invoiceNumber: string,
  amount: string
) {
  const msg = NOTIFICATION_MESSAGES.INVOICE_AVAILABLE({ invoiceNumber, amount });
  return createNotification({ userId, type: 'INVOICE_AVAILABLE', ...msg });
}

export async function createInvoicePaidNotification(
  userId: string,
  invoiceNumber: string,
  amount: string
) {
  const msg = NOTIFICATION_MESSAGES.INVOICE_PAID({ invoiceNumber, amount });
  const notification = await createNotification({ userId, type: 'INVOICE_PAID', ...msg });

  try {
    const client = await prisma.user.findFirst({
      where: notDeleted({ id: userId }),
      select: { name: true, email: true, language: true },
    });
    if (client) {
      const locale = client.language ?? 'fr';
      const { subject, html } = getEmailTemplate('invoice_paid', {
        clientName: client.name ?? client.email,
        invoiceNumber,
        amount,
      }, locale);
      await sendEmail({ to: client.email, subject, html });
    }
  } catch { /* non-blocking */ }

  return notification;
}

export async function createStayPhotoNotification(
  userId: string,
  petName: string,
  bookingRef: string,
  bookingId: string
) {
  const msg = NOTIFICATION_MESSAGES.STAY_PHOTO({ petName, bookingRef });
  return createNotification({ userId, type: 'STAY_PHOTO', ...msg, metadata: { bookingId } });
}

export async function createStayPhotoAddedNotification(
  clientId: string,
  bookingId: string,
  petNames: string[],
) {
  const names = petNames.length > 0 ? petNames.join(', ') : 'votre animal';
  const namesEn = petNames.length > 0 ? petNames.join(', ') : 'your pet';
  const msg = NOTIFICATION_MESSAGES.STAY_PHOTO_ADDED({ names, namesEn });
  return createNotification({ userId: clientId, type: 'STAY_PHOTO_ADDED', ...msg, metadata: { bookingId } });
}

export async function createAdminMessageNotification(
  userId: string,
  messageFr: string,
  messageEn: string,
  bookingId?: string
) {
  return createNotification({
    userId,
    type: 'ADMIN_MESSAGE',
    titleFr: 'Message de Dog Universe',
    titleEn: 'Message from Dog Universe',
    titleAr: 'رسالة من Dog Universe',
    messageFr,
    messageEn,
    // No AR-translated body for ad-hoc admin messages — fallback to EN at render.
    messageAr: messageEn,
    metadata: bookingId ? { bookingId } : undefined,
  });
}

// End-of-stay report — same pipeline as ADMIN_MESSAGE but with a distinct
// `type` so the client app can render a dedicated icon/header and the
// admin can filter the inbox. The structured form data lives in
// `EndStayReport` (separate table). Here we only persist the rendered
// text body alongside the bookingId metadata for routing/links.
export async function createEndStayReportNotification(
  userId: string,
  messageFr: string,
  messageEn: string,
  bookingId: string,
  reportId: string,
) {
  return createNotification({
    userId,
    type: 'END_STAY_REPORT',
    titleFr: 'Rapport de fin de séjour',
    titleEn: 'End-of-stay report',
    titleAr: 'تقرير نهاية الإقامة',
    messageFr,
    messageEn,
    messageAr: messageEn,
    metadata: { bookingId, reportId },
  });
}

export async function notifyAdminsNewClient(
  clientName: string,
  clientEmail: string,
  clientPhone: string | null,
  clientId: string
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.doguniverse.ma';
  const phonePart = clientPhone ? ` · ${clientPhone}` : '';
  const msg = NOTIFICATION_MESSAGES.NEW_CLIENT_REGISTRATION({ clientName, clientEmail, phonePart });
  await createAdminNotifications({
    type: 'NEW_CLIENT_REGISTRATION',
    ...msg,
    metadata: { clientId, clientUrl: `${appUrl}/fr/admin/clients/${clientId}` },
  });

  // Send email to all admin emails (non-blocking)
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPERADMIN'] }, deletedAt: null },
      select: { email: true, language: true },
    });
    const { getEmailTemplate: getTemplate } = await import('@/lib/email');
    await Promise.all(admins.map(async (admin) => {
      const locale = admin.language ?? 'fr';
      const clientUrl = `${appUrl}/${locale}/admin/clients/${clientId}`;
      const { subject, html } = getTemplate(
        'admin_new_client',
        { clientName, clientEmail, clientPhone: clientPhone ?? '', clientUrl, registeredAt: new Date().toISOString() },
        locale
      );
      await sendEmail({ to: admin.email, subject, html });
    }));
  } catch { /* non-blocking */ }
}
