import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { acquireCronLock } from '@/lib/cron-lock';
import { getDlqQueue } from '@/lib/queues/index';
import { isBullMQConfigured } from '@/lib/redis-bullmq';
import { createNotification } from '@/lib/notifications';

const DLQ_ALERT_THRESHOLD = 100;

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '');

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error(JSON.stringify({ level: 'error', service: 'cron-dlq-watch', message: 'CRON_SECRET not configured', timestamp: new Date().toISOString() }));
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  const secretBuf = Buffer.from(secret ?? '');
  const expectedBuf = Buffer.from(cronSecret);
  const authorized = secretBuf.length === expectedBuf.length && timingSafeEqual(secretBuf, expectedBuf);
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Idempotency: short-circuit if the weekly cron already ran this ISO week.
  const acquired = await acquireCronLock('dlq-watch', 6 * 24 * 3600, 'weekly');
  if (!acquired) {
    return NextResponse.json({ skipped: true, reason: 'already_run' }, { status: 200 });
  }

  if (!isBullMQConfigured()) {
    return NextResponse.json({ skipped: true, reason: 'BullMQ not configured', count: 0, alerted: false });
  }

  let count = 0;
  try {
    const dlqQueue = getDlqQueue();
    count = await dlqQueue.count();
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', service: 'cron-dlq-watch', message: 'Failed to get DLQ count', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
    return NextResponse.json({ error: 'DLQ_COUNT_FAILED' }, { status: 500 });
  }

  if (count <= DLQ_ALERT_THRESHOLD) {
    return NextResponse.json({ count, alerted: false });
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
      console.error(JSON.stringify({ level: 'error', service: 'cron-dlq-watch', message: 'createNotification failed', userId: sa.id, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
    }
  }

  return NextResponse.json({ count, alerted: true, notified });
}
