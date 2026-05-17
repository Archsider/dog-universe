// POST /api/admin/bookings/[id]/end-report — ADMIN / SUPERADMIN only.
//
// Persists an end-of-stay report row (`EndStayReport`) AND creates a
// Notification of type `END_STAY_REPORT` for the client + sends the email
// through the existing sendEmailNow pipeline. One PR, one chokepoint.
//
// GET /api/admin/bookings/[id]/end-report
//   Lists all reports for a booking. UI uses it to surface a "déjà envoyé
//   le X par Y" banner so the admin doesn't accidentally re-send.
//
// SAFETY:
//   - Auth: admin/superadmin only.
//   - The booking must exist + not be soft-deleted.
//   - Form data must pass `isFormReadyToSend` (at least one section has
//     content). 400 INCOMPLETE otherwise — same gate as the UI button.
//   - The Notification + EndStayReport row + email send are NOT in a
//     single DB transaction (sendEmailNow is fire-and-forget). If the
//     email fails, the report row + notification still exist — the client
//     sees the in-app message even if the email never arrived. That's
//     the right failure mode (in-app > email).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { logger } from '@/lib/logger';
import { logAction } from '@/lib/log';
import {
  buildEndStayReportMessage,
  isFormReadyToSend,
  SECTIONS,
  type EndStayReportFormData,
  type SectionKey,
} from '@/lib/end-stay-report';
import { createEndStayReportNotification } from '@/lib/notifications';
import { sendEmailNow } from '@/lib/notify-now';
import { getEmailTemplate } from '@/lib/email';
import { differenceInCalendarDays } from 'date-fns';
import { withSpan } from '@/lib/observability';

interface Params {
  params: Promise<{ id: string }>;
}

// ─── Zod-free validator (cheap, no extra dep) ──────────────────────────────
// Validates the shape we receive from the form client component. Returns a
// fully-typed EndStayReportFormData or null + reason. Strict on unknown
// section keys (we won't silently accept future drift).
function validateFormData(input: unknown): { ok: true; data: EndStayReportFormData } | { ok: false; reason: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'body must be an object' };
  }
  const obj = input as Record<string, unknown>;
  if (typeof obj.closingNote !== 'string') return { ok: false, reason: 'closingNote must be a string' };
  if (obj.version !== 1) return { ok: false, reason: 'unsupported version (expected 1)' };
  if (!obj.sections || typeof obj.sections !== 'object') return { ok: false, reason: 'sections must be an object' };

  const sections = obj.sections as Record<string, unknown>;
  const out: Record<SectionKey, { checked: string[]; freeText: string }> = {} as never;
  for (const def of SECTIONS) {
    const s = sections[def.key];
    if (!s || typeof s !== 'object' || Array.isArray(s)) {
      return { ok: false, reason: `section ${def.key} missing or malformed` };
    }
    const checkedRaw = (s as Record<string, unknown>).checked;
    const freeTextRaw = (s as Record<string, unknown>).freeText;
    if (!Array.isArray(checkedRaw) || !checkedRaw.every((v) => typeof v === 'string')) {
      return { ok: false, reason: `section ${def.key}.checked must be string[]` };
    }
    if (typeof freeTextRaw !== 'string') {
      return { ok: false, reason: `section ${def.key}.freeText must be a string` };
    }
    // Cap free text to 2000 chars per section — prevents DoS via huge payloads.
    out[def.key] = {
      checked: (checkedRaw as string[]).slice(0, 50),
      freeText: (freeTextRaw as string).slice(0, 2000),
    };
  }
  return {
    ok: true,
    data: {
      sections: out,
      closingNote: (obj.closingNote as string).slice(0, 1000),
      version: 1,
    },
  };
}

function formatStayLabel(
  startDate: Date | null,
  endDate: Date | null,
  locale: 'fr' | 'en',
): string {
  if (!startDate || !endDate) {
    // Open-ended walk-in stays — fall back to a single-date label.
    const fmt = locale === 'fr' ? 'fr-MA' : 'en-GB';
    const start = startDate?.toLocaleDateString(fmt, { day: '2-digit', month: 'long', year: 'numeric' });
    return start ?? '';
  }
  const fmt = locale === 'fr' ? 'fr-MA' : 'en-GB';
  const fmtOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long', year: 'numeric' };
  const startStr = startDate.toLocaleDateString(fmt, fmtOpts);
  const endStr = endDate.toLocaleDateString(fmt, fmtOpts);
  const nights = Math.max(1, differenceInCalendarDays(endDate, startDate));
  if (locale === 'fr') {
    return `Du ${startStr} au ${endStr} · ${nights} nuit${nights > 1 ? 's' : ''}`;
  }
  return `From ${startStr} to ${endStr} · ${nights} night${nights > 1 ? 's' : ''}`;
}

const SERVICE_LABEL_FR: Record<string, string> = {
  BOARDING: 'Pension',
  PET_TAXI: 'Pet Taxi',
};
const SERVICE_LABEL_EN: Record<string, string> = {
  BOARDING: 'Boarding',
  PET_TAXI: 'Pet Taxi',
};

export async function POST(request: NextRequest, { params }: Params) {
  const { id: bookingId } = await params;
  return withSpan('api.admin.bookings.end_report', { entityId: bookingId }, () => endReportImpl(request, bookingId));
}

async function endReportImpl(request: NextRequest, bookingId: string): Promise<Response> {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Load + check booking
  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id: bookingId }),
    select: {
      id: true,
      serviceType: true,
      startDate: true,
      endDate: true,
      client: { select: { id: true, name: true, email: true, language: true } },
      bookingPets: { select: { pet: { select: { name: true, gender: true } } } },
    },
  });
  if (!booking) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // ── Validate form
  const json = await request.json().catch(() => null);
  const parsed = validateFormData(json);
  if (!parsed.ok) {
    return NextResponse.json({ error: 'INVALID_BODY', detail: parsed.reason }, { status: 400 });
  }
  if (!isFormReadyToSend(parsed.data)) {
    return NextResponse.json(
      { error: 'INCOMPLETE', detail: 'At least one section must have a checkbox or free text.' },
      { status: 400 },
    );
  }

  // ── Build the rendered message in both locales
  const locale: 'fr' | 'en' = booking.client.language === 'en' ? 'en' : 'fr';
  const petLabel = booking.bookingPets
    .map((bp) => bp.pet?.name)
    .filter((n): n is string => Boolean(n))
    .join(locale === 'fr' ? ' et ' : ' and ') || (locale === 'fr' ? 'votre compagnon' : 'your companion');

  const messageFr = buildEndStayReportMessage(parsed.data, {
    locale: 'fr',
    clientName: booking.client.name ?? 'Client',
    petLabel,
    stayLabel: formatStayLabel(booking.startDate, booking.endDate, 'fr'),
    serviceLabel: SERVICE_LABEL_FR[booking.serviceType] ?? booking.serviceType,
  });
  const messageEn = buildEndStayReportMessage(parsed.data, {
    locale: 'en',
    clientName: booking.client.name ?? 'Client',
    petLabel,
    stayLabel: formatStayLabel(booking.startDate, booking.endDate, 'en'),
    serviceLabel: SERVICE_LABEL_EN[booking.serviceType] ?? booking.serviceType,
  });
  const finalMessage = locale === 'en' ? messageEn : messageFr;

  // ── Persist the report row first (single source of truth for "this
  //    happened, here's the form data") — then create the notification.
  const report = await prisma.endStayReport.create({
    data: {
      bookingId: booking.id,
      clientId: booking.client.id,
      formData: JSON.stringify(parsed.data),
      finalMessage,
      sentBy: session.user.id,
      version: 1,
    },
    select: { id: true, sentAt: true, version: true },
  });

  // ── Notification (in-app)
  await createEndStayReportNotification(
    booking.client.id,
    messageFr,
    messageEn,
    booking.id,
    report.id,
  );

  // ── Email — fire-and-forget. We reuse the admin_message template for
  // backwards-compat (same look, same envelope). If we want a dedicated
  // template later (richer formatting), it's a 10-line drop-in.
  try {
    const { subject, html } = getEmailTemplate(
      'admin_message',
      {
        clientName: booking.client.name ?? 'Client',
        message: finalMessage,
        bookingRef: booking.id.slice(0, 8).toUpperCase(),
      },
      locale,
    );
    sendEmailNow({ to: booking.client.email, subject, html });
  } catch (err) {
    // Don't fail the request if email helper itself throws (config issue,
    // template not found etc) — the in-app notification is already written.
    logger.error('end-stay-report', 'email send failed (in-app already sent)', {
      bookingId, error: err instanceof Error ? err.message : String(err),
    });
  }

  await logAction({
    userId: session.user.id,
    action: 'END_STAY_REPORT_SENT',
    entityType: 'booking',
    entityId: booking.id,
    details: {
      reportId: report.id,
      version: report.version,
      checkedCounts: Object.fromEntries(
        SECTIONS.map((s) => [s.key, parsed.data.sections[s.key].checked.length]),
      ),
      messageLength: finalMessage.length,
    },
  });

  return NextResponse.json({ ok: true, reportId: report.id, sentAt: report.sentAt });
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: bookingId } = await params;

  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Returns the history of reports for this booking (typically 0 or 1, but
  // can be 2+ if the admin re-sent an updated report). UI shows the most
  // recent + offers a "Renvoyer" prompt.
  const reports = await prisma.endStayReport.findMany({
    where: { bookingId },
    orderBy: { sentAt: 'desc' },
    select: {
      id: true,
      sentAt: true,
      version: true,
      finalMessage: true,
      sender: { select: { name: true } },
    },
    take: 10,
  });

  return NextResponse.json({
    reports: reports.map((r) => ({
      id: r.id,
      sentAt: r.sentAt.toISOString(),
      version: r.version,
      finalMessage: r.finalMessage,
      sentByName: r.sender.name ?? null,
    })),
  });
}
