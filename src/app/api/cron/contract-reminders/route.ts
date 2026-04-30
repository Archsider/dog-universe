import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { acquireCronLock } from '@/lib/cron-lock';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.doguniverse.ma';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '');

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Idempotency: short-circuit if the weekly cron already ran this ISO week.
  const acquired = await acquireCronLock('contract-reminders', 6 * 24 * 3600, 'weekly');
  if (!acquired) {
    return NextResponse.json({ skipped: true, reason: 'already_run' }, { status: 200 });
  }

  const unsigned = await prisma.user.findMany({
    where: { role: 'CLIENT', contract: null },
    select: { id: true, name: true, email: true, language: true, phone: true },
  });

  // Limite : 1 rappel max par client tous les 7 jours.
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  let sent = 0;
  let skipped = 0;
  for (const client of unsigned) {
    try {
      // Skip si un rappel a déjà été envoyé dans les 7 derniers jours.
      const recentReminder = await prisma.notification.findFirst({
        where: {
          userId: client.id,
          type: 'CONTRACT_REMINDER',
          createdAt: { gte: sevenDaysAgo },
        },
        select: { id: true },
      });
      if (recentReminder) { skipped++; continue; }

      const locale = client.language ?? 'fr';
      const loginUrl = `${APP_URL}/${locale}/auth/login`;
      const { subject, html } = getEmailTemplate(
        'contract_reminder',
        { clientName: client.name ?? client.email, loginUrl },
        locale
      );
      await sendEmail({ to: client.email, subject, html });

      // SMS rappel contrat — premium tone (additif, échec ne bloque pas)
      if (client.phone) {
        const firstName = (client.name ?? '').split(' ')[0] || (client.name ?? '');
        await sendSMS(
          client.phone,
          `Bonjour ${firstName}, votre contrat Dog Universe est en attente de signature. Connectez-vous sur votre espace client pour finaliser votre dossier. — Dog Universe`,
        );
      }

      // Trace de l'envoi — sert de marqueur pour la fenêtre de 7 jours.
      await prisma.notification.create({
        data: {
          userId: client.id,
          type: 'CONTRACT_REMINDER',
          titleFr: 'Rappel contrat',
          titleEn: 'Contract reminder',
          messageFr: 'Votre contrat Dog Universe est en attente de signature.',
          messageEn: 'Your Dog Universe contract is pending signature.',
          read: false,
        },
      }).catch(err => console.error(JSON.stringify({ level: 'error', service: 'cron-contract-reminders', message: 'contract reminder notification trace failed', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() })));

      sent++;
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', service: 'cron-contract-reminders', message: 'contract reminder failed for client', clientId: client.id, error: e instanceof Error ? e.message : String(e), timestamp: new Date().toISOString() }));
    }
  }

  // debug log removed (contract-reminders summary)
  return NextResponse.json({ sent, skipped, total: unsigned.length });
}
