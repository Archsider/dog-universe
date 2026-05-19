// POST /api/admin/daily-reports/[id]/send
//
// Finalize a DRAFT daily report : flip status → SENT, send the email,
// create the in-app notification.  Returns the WhatsApp share URL so the
// admin UI can also pop the wa.me deep link for manual sharing.

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { getEmailTemplate } from '@/lib/email';
import { sendEmailNow } from '@/lib/notify-now';
import { createNotification } from '@/lib/notifications';
import { logger } from '@/lib/logger';
import { logAction } from '@/lib/log';
import { withSpan } from '@/lib/observability';
import {
  validateForSend,
  buildWhatsappMessage,
  buildWhatsappShareUrl,
} from '@/lib/daily-reports';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function prettyDateFr(ymd: string): string {
  // 'YYYY-MM-DD' → Date in Casa-equivalent local interpretation.  Since the
  // Date object is used only for formatting the day name + month name +
  // year, the exact timezone offset doesn't change the readable output.
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function prettyDateEn(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const report = await prisma.dailyReport.findUnique({
    where: { id },
    include: {
      pet: { select: { name: true } },
      booking: {
        select: {
          client: {
            select: {
              id: true, name: true, firstName: true,
              email: true, phone: true, isWalkIn: true,
            },
          },
        },
      },
    },
  });

  if (!report) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (report.status !== 'DRAFT') {
    return NextResponse.json({ error: 'NOT_DRAFT' }, { status: 409 });
  }

  // Content gate — refuse to send a totally empty card.
  const validationError = validateForSend({
    photoUrls: report.photoUrls,
    moodEmoji: report.moodEmoji,
    foodEmoji: report.foodEmoji,
    sleepEmoji: report.sleepEmoji,
    playEmoji: report.playEmoji,
    note: report.note,
  });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const client = report.booking.client;
  const sentAt = new Date();

  await withSpan(
    'api.daily-report.send',
    { reportId: report.id, clientId: client.id, petId: report.petId },
    () =>
      prisma.dailyReport.update({
        where: { id: report.id },
        data: { status: 'SENT', sentAt, sentBy: session.user.id },
      }),
  );

  // In-app notification — always created so the client sees it on
  // /client/notifications even if the email bounces or the user is walk-in.
  const titleFr = `🐾 Nouvelles de ${report.pet.name}`;
  const titleEn = `🐾 News from ${report.pet.name}`;
  const messageFr = report.note?.trim()
    || `Un petit mot du séjour de ${report.pet.name} aujourd'hui.`;
  const messageEn = report.note?.trim()
    || `A quick update from ${report.pet.name}'s stay today.`;
  try {
    await createNotification({
      userId: client.id,
      type: 'DAILY_REPORT',
      titleFr,
      titleEn,
      messageFr,
      messageEn,
      metadata: { dailyReportId: report.id, petId: report.petId, date: report.date },
    });
  } catch (err) {
    logger.error('daily-reports', 'NOTIFICATION_CREATE_FAILED', {
      reportId: report.id,
      error: err instanceof Error ? err.message : String(err),
    });
    // Notification failure is non-blocking — the email is the primary
    // delivery channel for this feature.
  }

  // Email — only if client has a real (non-walkin-synthetic) email address.
  const hasRealEmail = !!(client.email && !client.email.endsWith('@dog-universe.local'));
  if (hasRealEmail && client.email) {
    try {
      const tpl = getEmailTemplate(
        'daily_report',
        {
          clientFirstName: client.firstName ?? '',
          petName: report.pet.name,
          dateLong: prettyDateFr(report.date),
          dateLongEn: prettyDateEn(report.date),
          moodEmoji: report.moodEmoji ?? '',
          foodEmoji: report.foodEmoji ?? '',
          sleepEmoji: report.sleepEmoji ?? '',
          playEmoji: report.playEmoji ?? '',
          note: report.note ?? '',
          photo1Url: report.photoUrls[0] ?? '',
          photo2Url: report.photoUrls[1] ?? '',
          photo3Url: report.photoUrls[2] ?? '',
        },
        'fr',
      );
      sendEmailNow({ to: client.email, subject: tpl.subject, html: tpl.html });
    } catch (err) {
      logger.error('daily-reports', 'EMAIL_SEND_FAILED', {
        reportId: report.id,
        error: err instanceof Error ? err.message : String(err),
      });
      // Flag for retry from the UI — but don't fail the request.
      await prisma.dailyReport.update({
        where: { id: report.id },
        data: { emailFailed: true },
      });
    }
  }

  await logAction({
    userId: session.user.id,
    action: 'DAILY_REPORT_SENT',
    entityType: 'DailyReport',
    entityId: report.id,
    details: {
      petId: report.petId,
      petName: report.pet.name,
      clientId: client.id,
      hasEmail: hasRealEmail,
    },
  });

  // Build the WhatsApp share URL for the admin UI to pop open.
  const message = buildWhatsappMessage({
    clientFirstName: client.firstName,
    petName: report.pet.name,
    date: report.date,
    emoji: {
      mood: report.moodEmoji,
      food: report.foodEmoji,
      sleep: report.sleepEmoji,
      play: report.playEmoji,
    },
    note: report.note,
  });
  const whatsappUrl = buildWhatsappShareUrl({
    clientPhone: client.phone,
    message,
  });

  return NextResponse.json({
    ok: true,
    sentAt: sentAt.toISOString(),
    emailSent: hasRealEmail,
    whatsappUrl,
  });
}
