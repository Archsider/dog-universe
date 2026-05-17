import { parseMetadata } from '@/lib/notifications/metadata';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { getEmailTemplate } from '@/lib/email';
import { enqueueEmail } from '@/lib/queues';
import { createNotification } from '@/lib/notifications';
import { APP_URL } from '@/lib/config';
import { formatMAD } from '@/lib/utils';
import { toNumber } from '@/lib/decimal';
import { getCasaStartOfDay } from '@/lib/timezone';
import { log } from '@/lib/logger';
import { defineCron } from '@/lib/cron-runner';
import { InvoiceStatus } from '@prisma/client';

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
export const GET = defineCron({
  name: 'overdue-invoices',
  period: 'daily',
  fn: async ({ now }) => {
    // Today's window in Casablanca local time so J+30 / J+60 calendar arithmetic
    // matches what a Moroccan operator expects (an UTC-anchored midnight would
    // shift the overdue threshold by one hour).
    const startOfToday = getCasaStartOfDay(now);
    // Tomorrow midnight Casa = startOfToday + 24h. setDate() on the Casa
    // Date is safe in principle but adding a fixed-day-as-ms keeps us out
    // of any browser/runtime Date arithmetic quirks.
    const startOfTomorrow = new Date(startOfToday.getTime() + 86_400_000);

    let sent = 0;
    let skipped = 0;
    let failures = 0;
    const errors: string[] = [];

    for (const reminder of REMINDERS) {
      const windowEnd = new Date(startOfTomorrow.getTime() - reminder.minDays * 86_400_000);
      const windowStart = new Date(startOfTomorrow.getTime() - reminder.maxDays * 86_400_000);

      const invoices = await prisma.invoice.findMany({
        where: {
          status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIALLY_PAID] },
          issuedAt: { gte: windowStart, lt: windowEnd },
          client: notDeleted({ isWalkIn: false, role: 'CLIENT' }),
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
      const last24h = new Date(now.getTime() - 24 * 3600 * 1000);
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
          const meta = parseMetadata(n.metadata);
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

    return {
      sent,
      skipped,
      failures,
      errors: errors.length ? errors : undefined,
    };
  },
});
