import { prisma } from '@/lib/prisma';
import { getDlqQueue, DLQ_ALERT_THRESHOLD } from '@/lib/queues/index';
import { isBullMQConfigured } from '@/lib/redis-bullmq';
import { createNotification } from '@/lib/notifications';
import { defineCron } from '@/lib/cron-runner';

export const maxDuration = 30;

export const GET = defineCron({
  name: 'dlq-watch',
  period: 'weekly',
  fn: async ({ logger }) => {
    if (!isBullMQConfigured()) {
      return { skipped: true, reason: 'BullMQ not configured', count: 0, alerted: false };
    }

    let count = 0;
    try {
      const dlqQueue = getDlqQueue();
      count = await dlqQueue.count();
    } catch (err) {
      logger.error('cron-dlq-watch', 'Failed to get DLQ count', { error: err instanceof Error ? err.message : String(err) });
      throw new Error('DLQ_COUNT_FAILED');
    }

    if (count <= DLQ_ALERT_THRESHOLD) {
      return { count, alerted: false };
    }

    // DLQ depth exceeds threshold — notify all SUPERADMINs
    const superadmins = await prisma.user.findMany({
      where: { role: 'SUPERADMIN', deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
      select: { id: true },
    });

    let notified = 0;
    for (const sa of superadmins) {
      try {
        await createNotification({
          userId: sa.id,
          type: 'ADMIN_MESSAGE',
          titleFr: `🚨 DLQ critique : ${count} jobs échoués`,
          titleEn: `🚨 DLQ critical: ${count} failed jobs`,
          messageFr: `La Dead Letter Queue contient ${count} jobs définitivement échoués (seuil : ${DLQ_ALERT_THRESHOLD}). Rendez-vous sur /admin/queues pour inspecter et rejouer les jobs.`,
          messageEn: `The Dead Letter Queue contains ${count} permanently failed jobs (threshold: ${DLQ_ALERT_THRESHOLD}). Go to /admin/queues to inspect and replay jobs.`,
          metadata: { count: String(count), threshold: String(DLQ_ALERT_THRESHOLD) },
        });
        notified++;
      } catch (err) {
        logger.error('cron-dlq-watch', 'createNotification failed', { userId: sa.id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return { count, alerted: true, notified };
  },
});
