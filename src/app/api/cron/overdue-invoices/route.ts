import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmailTemplate } from '@/lib/email';
import { enqueueEmail } from '@/lib/queues';
import { createNotification } from '@/lib/notifications';
import { acquireCronLock } from '@/lib/cron-lock';
import { markCronRun } from '@/lib/observability';
import { APP_URL } from '@/lib/config';
import { formatMAD } from '@/lib/utils';
import { toNumber } from '@/lib/decimal';
import { log } from '@/lib/logger';

export const maxDuration = 60;

type ReminderKind = 'overdue_30' | 'overdue_60';

const REMINDERS: Array<{ kind: ReminderKind; minDays: number; maxDays: number; template: 'invoice_overdue_30' | 'invoice_overdue_60' }> = [
  { kind: 'overdue_30', minDays: 30, maxDays: 31, template: 'invoice_overdue_30' },
  { kind: 'overdue_60', minDays: 60, maxDays: 61, template: 'invoice_overdue_60' },
];

/**
 * GET /api/cron/overdue-invoices
 * Daily cron : envoie un premier rappel à J+30 et un second à J+60 sur les
 * factures `PENDING` ou `PARTIAL` non soldées. Walk-in clients exclus
 * (pas d'espace portail). Déduplication par notification `INVOICE_OVERDUE`
 * + metadata { invoiceId, reminderKind } sur les 24h.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '');

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error(JSON.stringify({
      level: 'error',
      service: 'cron-overdue-invoices',
      message: 'CRON_SECRET not configured',
      timestamp: new Date().toISOString(),
    }));
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const secretBuf = Buffer.from(secret ?? '');
  const expectedBuf = Buffer.from(cronSecret);
  const authorized = secretBuf.length === expectedBuf.length && timingSafeEqual(secretBuf, expectedBuf);
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const acquired = await acquireCronLock('overdue-invoices', 23 * 3600, 'daily');
  if (!acquired) {
    return NextResponse.json({ skipped: true, reason: 'already_run' }, { status: 200 });
  }

  await markCronRun('overdue-invoices');

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  let sent = 0;
  let skipped = 0;
  let failures = 0;
  const errors: string[] = [];

  for (const reminder of REMINDERS) {
    const windowEnd = new Date(startOfTomorrow);
    windowEnd.setDate(windowEnd.getDate() - reminder.minDays);
    const windowStart = new Date(startOfTomorrow);
    windowStart.setDate(windowStart.getDate() - reminder.maxDays);

    const invoices = await prisma.invoice.findMany({
      where: {
        status: { in: ['PENDING', 'PARTIAL', 'PARTIALLY_PAID'] },
        issuedAt: { gte: windowStart, lt: windowEnd },
        client: { deletedAt: null, isWalkIn: false, role: 'CLIENT' },
      },
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        paidAmount: true,
        issuedAt: true,
        client: { select: { id: true, name: true, email: true, language: true } },
      },
      take: 500,
    });

    if (invoices.length === 0) continue;

    // Déduplication 24h via notifications INVOICE_OVERDUE existantes.
    const last24h = new Date(now);
    last24h.setHours(last24h.getHours() - 24);
    const existing = await prisma.notification.findMany({
      where: {
        userId: { in: invoices.map(i => i.client.id) },
        type: 'INVOICE_OVERDUE',
        createdAt: { gte: last24h },
      },
      select: { metadata: true },
    });
    const alreadySent = new Set<string>();
    for (const n of existing) {
      try {
        const meta = JSON.parse(n.metadata ?? '{}') as Record<string, unknown>;
        if (typeof meta.invoiceId === 'string' && typeof meta.reminderKind === 'string') {
          alreadySent.add(`${meta.invoiceId}:${meta.reminderKind}`);
        }
      } catch { /* ignore */ }
    }

    await Promise.all(invoices.map(async (invoice) => {
      try {
        const dedupKey = `${invoice.id}:${reminder.kind}`;
        if (alreadySent.has(dedupKey)) { skipped++; return; }

        const remaining = Math.max(0, toNumber(invoice.amount) - toNumber(invoice.paidAmount));
        if (remaining <= 0) { skipped++; return; }

        const locale = invoice.client.language ?? 'fr';
        const isFr = locale === 'fr';
        const issuedAt = invoice.issuedAt.toLocaleDateString(
          isFr ? 'fr-MA' : 'en-GB',
          { day: 'numeric', month: 'long', year: 'numeric' },
        );
        const portalUrl = `${APP_URL}/${locale}/client/invoices/${invoice.id}`;

        const { subject, html } = getEmailTemplate(
          reminder.template,
          {
            clientName: invoice.client.name ?? invoice.client.email,
            invoiceNumber: invoice.invoiceNumber,
            amountDue: formatMAD(remaining),
            issuedAt,
            portalUrl,
          },
          locale,
        );

        const titleFr = reminder.kind === 'overdue_30'
          ? `Facture ${invoice.invoiceNumber} en attente`
          : `Second rappel : facture ${invoice.invoiceNumber}`;
        const titleEn = reminder.kind === 'overdue_30'
          ? `Invoice ${invoice.invoiceNumber} pending`
          : `Second reminder: invoice ${invoice.invoiceNumber}`;
        const messageFr = `Solde restant dû : ${formatMAD(remaining)} (émise le ${issuedAt}).`;
        const messageEn = `Outstanding balance: ${formatMAD(remaining)} (issued on ${issuedAt}).`;

        await Promise.all([
          enqueueEmail(
            { to: invoice.client.email, subject, html },
            `overdue:${invoice.id}:${reminder.kind}`,
          ),
          createNotification({
            userId: invoice.client.id,
            type: 'INVOICE_OVERDUE',
            titleFr,
            titleEn,
            messageFr,
            messageEn,
            metadata: { invoiceId: invoice.id, reminderKind: reminder.kind },
          }),
        ]);
        sent++;
      } catch (err) {
        failures++;
        errors.push(`${reminder.kind}:${invoice.id}: ${String(err)}`);
      }
    }));
  }

  if (errors.length) {
    await log('error', 'cron-overdue-invoices', 'Some overdue reminders failed', { errors });
  }

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    failures,
    errors: errors.length ? errors : undefined,
  });
}
