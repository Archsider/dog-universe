// SUPERADMIN diagnostics endpoint — surfaces live infra state.
// Booleans only (presence/absence of env vars), no secret values ever leave
// this route. Each section is wrapped in try/catch so one failure (e.g.
// Redis down) does not blank out the rest of the report.
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import type { Queue } from 'bullmq';
import { isBullMQConfigured } from '@/lib/redis-bullmq';
import { getEmailQueue, getSmsQueue, getDlqQueue } from '@/lib/queues/index';
import { getWorkerLastRun } from '@/lib/cache';
import { getLastEmailSentAt } from '@/lib/email-health';
import { prisma } from '@/lib/prisma';

type Counts = { waiting: number; active: number; completed: number; failed: number; delayed: number };
type QueueSection = Counts | { error: string };

function present(v: string | undefined | null): boolean {
  return typeof v === 'string' && v.length > 0;
}

async function safeQueueCounts<T = unknown>(getter: () => Queue<T>): Promise<QueueSection> {
  try {
    const q = getter();
    const c = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    return {
      waiting: c.waiting ?? 0,
      active: c.active ?? 0,
      completed: c.completed ?? 0,
      failed: c.failed ?? 0,
      delayed: c.delayed ?? 0,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function lastSmsSentIso(): Promise<string | null> {
  try {
    const last = await prisma.smsLog.findFirst({
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    });
    return last?.sentAt?.toISOString() ?? null;
  } catch {
    return null;
  }
}

async function lastEmailSentIso(): Promise<string | null> {
  // Reads `email:last:sent` from Redis. `markEmailSent()` writes this key
  // from inside `sendEmail()` — single chokepoint for both the BullMQ
  // worker path (cron batches) and the direct `sendEmailNow` path
  // (transactional). The previous implementation queried BullMQ's
  // `getCompleted(0,0)` which only saw the queue path → widget froze
  // when all current sends went through `sendEmailNow`. Fixed by
  // re-routing the source of truth through Redis.
  return getLastEmailSentAt();
}

export async function GET() {
  const guard = await requireRole(['SUPERADMIN']);
  if (guard.error) return guard.error;

  // ── Env vars (booleans only) ────────────────────────────────────────────
  const env = (() => {
    try {
      return {
        email: {
          server: present(process.env.EMAIL_SERVER_HOST),
          user:   present(process.env.EMAIL_SERVER_USER),
          password: present(process.env.EMAIL_SERVER_PASSWORD),
          from:   present(process.env.EMAIL_FROM),
        },
        sms: {
          url:        present(process.env.SMS_GATEWAY_URL),
          username:   present(process.env.SMS_GATEWAY_USERNAME),
          password:   present(process.env.SMS_GATEWAY_PASSWORD),
          adminPhone: present(process.env.ADMIN_PHONE),
        },
        redis: {
          host:      present(process.env.UPSTASH_REDIS_HOST),
          port:      present(process.env.UPSTASH_REDIS_PORT),
          password:  present(process.env.UPSTASH_REDIS_PASSWORD),
          restUrl:   present(process.env.UPSTASH_REDIS_REST_URL),
          restToken: present(process.env.UPSTASH_REDIS_REST_TOKEN),
        },
        auth: {
          totpKey:        present(process.env.TOTP_ENCRYPTION_KEY),
          nextauthSecret: present(process.env.NEXTAUTH_SECRET),
          cronSecret:     present(process.env.CRON_SECRET),
        },
        sentry: {
          dsn: present(process.env.SENTRY_DSN) || present(process.env.NEXT_PUBLIC_SENTRY_DSN),
        },
        storage: {
          supabaseUrl:        present(process.env.SUPABASE_URL),
          supabaseServiceKey: present(process.env.SUPABASE_SERVICE_ROLE_KEY),
        },
      };
    } catch {
      return null;
    }
  })();

  // ── Queues (BullMQ counts, fail-soft per queue) ─────────────────────────
  let queues: {
    bullmqConfigured: boolean;
    email: QueueSection;
    sms: QueueSection;
    dlq: QueueSection;
  };
  try {
    const configured = isBullMQConfigured();
    if (!configured) {
      const noop: QueueSection = { error: 'BullMQ not configured' };
      queues = { bullmqConfigured: false, email: noop, sms: noop, dlq: noop };
    } else {
      const [email, sms, dlq] = await Promise.all([
        safeQueueCounts<unknown>(getEmailQueue as () => Queue<unknown>),
        safeQueueCounts<unknown>(getSmsQueue as () => Queue<unknown>),
        safeQueueCounts<unknown>(getDlqQueue),
      ]);
      queues = { bullmqConfigured: true, email, sms, dlq };
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    queues = {
      bullmqConfigured: false,
      email: { error: errMsg },
      sms: { error: errMsg },
      dlq: { error: errMsg },
    };
  }

  // ── Worker last run + last successful sends (best-effort) ───────────────
  const [workerLastRun, lastEmail, lastSms] = await Promise.all([
    getWorkerLastRun().catch(() => null),
    lastEmailSentIso(),
    lastSmsSentIso(),
  ]);

  return NextResponse.json({
    env,
    queues,
    workerLastRun,
    lastSuccessfulSends: { email: lastEmail, sms: lastSms },
    ts: new Date().toISOString(),
  });
}
