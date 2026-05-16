import { prisma } from '@/lib/prisma';
import { getEmailTemplate } from '@/lib/email';
import { enqueueEmail, enqueueSms } from '@/lib/queues';
import { APP_URL } from '@/lib/config';
import { defineCron } from '@/lib/cron-runner';

export const maxDuration = 60;

export const GET = defineCron({
  name: 'contract-reminders',
  period: 'weekly',
  fn: async ({ logger }) => {
    const unsigned = await prisma.user.findMany({
      where: { role: 'CLIENT', deletedAt: null, isWalkIn: false, contract: null }, // soft-delete: required — no global extension (Edge Runtime incompatible). Walk-in clients have no portal access — skip.
      select: { id: true, name: true, email: true, language: true, phone: true },
      take: 500,
    });

    // Limite : 1 rappel max par client tous les 7 jours. Casa-anchored : on
    // UTC Vercel, `new Date().setDate(d.getDate() - 7)` would silently shift
    // the cutoff by ±1h around Casa midnight.
    const { addDays } = await import('date-fns');
    const { startOfDayCasa } = await import('@/lib/dates-casablanca');
    const sevenDaysAgo = startOfDayCasa(addDays(new Date(), -7));

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
      take: 1000,
    });
    const alreadyRemindedUserIds = new Set(recentReminders.map(n => n.userId));

    let sent = 0;
    let skipped = 0;
    let failures = 0;
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
          }).catch(err => logger.error('cron-contract-reminders', 'contract reminder notification trace failed', { error: err instanceof Error ? err.message : String(err) })),
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

        const settled = await Promise.allSettled(ops);
        for (const s of settled) if (s.status === 'rejected') failures++;
        sent++;
      } catch (e) {
        logger.error('cron-contract-reminders', 'contract reminder failed for client', { clientId: client.id, error: e instanceof Error ? e.message : String(e) });
      }
    }));

    // debug log removed (contract-reminders summary)
    return { sent, skipped, failures, total: unsigned.length };
  },
});
