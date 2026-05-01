import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmailTemplate } from '@/lib/email';
import { enqueueEmail, enqueueSms } from '@/lib/queues';
import { acquireCronLock } from '@/lib/cron-lock';
import { APP_URL } from '@/lib/config';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '');

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error(JSON.stringify({ level: 'error', service: 'cron-contract-reminders', message: 'CRON_SECRET not configured', timestamp: new Date().toISOString() }));
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  const secretBuf = Buffer.from(secret ?? '');
  const expectedBuf = Buffer.from(cronSecret);
  const authorized = secretBuf.length === expectedBuf.length && timingSafeEqual(secretBuf, expectedBuf);
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Idempotency: short-circuit if the weekly cron already ran this ISO week.
  const acquired = await acquireCronLock('contract-reminders', 6 * 24 * 3600, 'weekly');
  if (!acquired) {
    return NextResponse.json({ skipped: true, reason: 'already_run' }, { status: 200 });
  }

  const unsigned = await prisma.user.findMany({
    where: { role: 'CLIENT', deletedAt: null, isWalkIn: false, contract: null }, // soft-delete: required — no global extension (Edge Runtime incompatible). Walk-in clients have no portal access — skip.
    select: { id: true, name: true, email: true, language: true, phone: true },
  });

  // Limite : 1 rappel max par client tous les 7 jours.
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Batch dedup: load all CONTRACT_REMINDER notifications sent in the last 7 days
  // for these clients in a single query, then check in-memory — avoids N findFirst calls.
  const clientIds = unsigned.map(u => u.id);
  const recentReminders = await prisma.notification.findMany({
    where: {
      userId: { in: clientIds },
      type: 'CONTRACT_REMINDER',
      createdAt: { gte: sevenDaysAgo },
    },
    select: { userId: true },
  });
  const alreadyRemindedUserIds = new Set(recentReminders.map(n => n.userId));

  let sent = 0;
  let skipped = 0;
  await Promise.all(unsigned.map(async (client) => {
    try {
      // Skip si un rappel a déjà été envoyé dans les 7 derniers jours.
      if (alreadyRemindedUserIds.has(client.id)) { skipped++; return; }

      const locale = client.language ?? 'fr';
      const loginUrl = `${APP_URL}/${locale}/auth/login`;
      const { subject, html } = getEmailTemplate(
        'contract_reminder',
        { clientName: client.name ?? client.email, loginUrl },
        locale
      );

      const ops: Promise<unknown>[] = [
        enqueueEmail({ to: client.email, subject, html }, `contract-reminder:${client.id}:email`),
        // Trace de l'envoi — sert de marqueur pour la fenêtre de 7 jours.
        prisma.notification.create({
          data: {
            userId: client.id,
            type: 'CONTRACT_REMINDER',
            titleFr: 'Rappel contrat',
            titleEn: 'Contract reminder',
            messageFr: 'Votre contrat Dog Universe est en attente de signature.',
            messageEn: 'Your Dog Universe contract is pending signature.',
            read: false,
          },
        }).catch(err => console.error(JSON.stringify({ level: 'error', service: 'cron-contract-reminders', message: 'contract reminder notification trace failed', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }))),
      ];

      // SMS rappel contrat — premium tone (additif, échec ne bloque pas)
      if (client.phone) {
        const firstName = (client.name ?? '').split(' ')[0] || (client.name ?? '');
        ops.push(enqueueSms(
          {
            to: client.phone,
            message: `Bonjour ${firstName}, votre contrat Dog Universe est en attente de signature. Connectez-vous sur votre espace client pour finaliser votre dossier. — Dog Universe`,
          },
          `contract-reminder:${client.id}:sms`,
        ));
      }

      await Promise.allSettled(ops);
      sent++;
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', service: 'cron-contract-reminders', message: 'contract reminder failed for client', clientId: client.id, error: e instanceof Error ? e.message : String(e), timestamp: new Date().toISOString() }));
    }
  }));

  // debug log removed (contract-reminders summary)
  return NextResponse.json({ sent, skipped, total: unsigned.length });
}
