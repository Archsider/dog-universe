// Web Push fan-out — keep all VAPID logic in one place.
//
// Env vars needed (set on Vercel) :
//   VAPID_PUBLIC_KEY   — exposed to the client too (NEXT_PUBLIC_VAPID_PUBLIC_KEY)
//   VAPID_PRIVATE_KEY  — server-side only
//   VAPID_SUBJECT      — "mailto:ops@doguniverse.ma" or similar
//
// Generate keys once : `npx web-push generate-vapid-keys`
//
// Fail-soft : if VAPID is not configured, the helper logs + skips.  No
// crash, no Sentry — the feature is simply opt-in.
//
// Source : Wave 6 #7 (deferred → landed 2026-05-20).

import webpush from 'web-push';
import { prisma } from './prisma';
import { logger } from './logger';

let configured = false;
let configuredOk = false;

function ensureConfigured(): boolean {
  if (configured) return configuredOk;
  configured = true;
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:ops@doguniverse.ma';
  if (!publicKey || !privateKey) {
    configuredOk = false;
    return false;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configuredOk = true;
    return true;
  } catch (err) {
    logger.error('web-push', 'setVapidDetails_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    configuredOk = false;
    return false;
  }
}

export interface PushPayload {
  title: string;
  body: string;
  /** Click action — relative URL inside the app. */
  url?: string;
  /** Optional icon override (default uses /icons/icon-192.png). */
  icon?: string;
  /** Tag groups notifications — replaces if same tag is delivered twice. */
  tag?: string;
}

/**
 * Send a push payload to every subscription of a given user.  Each failed
 * subscription (404/410) is cleaned up automatically — endpoints expire
 * silently when the browser revokes permission.
 */
export async function pushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (!ensureConfigured()) {
    return { sent: 0, failed: 0 };
  }
  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
    take: 20, // realistic cap per user (multi-device)
  });
  if (subs.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const expired: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
        sent++;
      } catch (err) {
        // 404 / 410 = endpoint expired — schedule cleanup.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const statusCode = (err as any)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          expired.push(s.id);
        }
        failed++;
        logger.warn('web-push', 'send_failed', {
          subscriptionId: s.id,
          statusCode,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  if (expired.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: expired } } }).catch(() => undefined);
  }
  // Stamp lastUsed on successful sends — lets us prune cold subscriptions later.
  if (sent > 0) {
    await prisma.pushSubscription.updateMany({
      where: { userId, id: { notIn: expired } },
      data: { lastUsed: new Date() },
    }).catch(() => undefined);
  }
  return { sent, failed };
}

/**
 * Fan-out helper — push to every ADMIN + SUPERADMIN.  Used for booking
 * events / pending validations / etc.
 */
export async function pushToAdmins(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (!ensureConfigured()) return { sent: 0, failed: 0 };
  const admins = await prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'SUPERADMIN'] },
      deletedAt: null,
      pushSubscriptions: { some: {} },
    },
    select: { id: true },
    take: 50,
  });
  let totalSent = 0;
  let totalFailed = 0;
  await Promise.all(admins.map(async (a) => {
    const r = await pushToUser(a.id, payload);
    totalSent += r.sent;
    totalFailed += r.failed;
  }));
  return { sent: totalSent, failed: totalFailed };
}

/** Check public-facing config — used by the client to enable the subscribe button. */
export function isPushConfigured(): boolean {
  return ensureConfigured();
}
