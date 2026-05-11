/**
 * POST /api/webhooks/sentry — AI Guardian webhook receiver.
 *
 * Pipeline (best-effort, fail-open):
 *   1. HMAC-SHA256 verify against `SENTRY_WEBHOOK_SECRET` (Sentry "Internal
 *      Integration" signing scheme: header `Sentry-Hook-Signature`).
 *   2. Parse the event, extract a stable Sentry event id.
 *   3. Idempotency: SET NX EX 24h on `sentry:event:{id}`. Replay → 200 noop.
 *   4. Sanitize payload (strip emails / phones / IDs / tokens).
 *   5. Count occurrences of this Sentry issue in the last 24h.
 *   6. Classify via Claude Haiku.
 *   7. Apply action: open GH issue (bug_code & recurrent) / notify SUPERADMIN
 *      (infra & data_corruption) / silence (transient & spam).
 *   8. Persist GuardianEvent row.
 *
 * Public endpoint (Sentry posts from its own infra, no session). Auth =
 * HMAC. Returns 200 on every parsed event so Sentry never retries our
 * webhook (we own retries internally).
 */

import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { tryAcquireFlag } from '@/lib/cache';
import { sanitizePayload, sanitizeString } from '@/lib/guardian/sanitize';
import { classifyEvent, unclassifiedResult, type ClassifierInput } from '@/lib/guardian/classifier';
import { openOrReuseIssue } from '@/lib/guardian/github';
import { createNotification } from '@/lib/notifications';
import { logger } from '@/lib/logger';

export const maxDuration = 30;

interface MinimalSentryEvent {
  event_id?: string;
  id?: string;
  title?: string;
  message?: string;
  culprit?: string;
  level?: string;
  environment?: string;
  release?: string;
  project_slug?: string;
  issue?: { id?: string; shortId?: string };
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
      stacktrace?: { frames?: Array<{ filename?: string; function?: string; lineno?: number }> };
    }>;
  };
  tags?: Array<[string, string]> | Record<string, string>;
}

interface SentryWebhookBody {
  action?: string;
  data?: { event?: MinimalSentryEvent; issue?: { id?: string; shortId?: string; project?: { slug?: string } } };
  installation?: { uuid?: string };
}

// C6 hardening: signed payload includes timestamp to prevent replay attacks
// even if signature leaks. Signed string = `<unix-seconds>.<rawBody>`.
function verifySignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  secret: string,
): boolean {
  if (!signature || !secret || !timestamp) return false;
  // Hex regex sanity check BEFORE Buffer.from() — Buffer.from('zz', 'hex')
  // silently returns an empty buffer, which would short-circuit timingSafeEqual
  // length check oddly. Reject malformed signatures upfront.
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const signed = `${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', secret).update(signed, 'utf8').digest('hex');
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

// C6 whitelist — Sentry sends many resource kinds (installation lifecycle,
// comments, etc). We only care about issue / event alerts.
const ALLOWED_RESOURCES = new Set(['event_alert', 'issue']);
const TIMESTAMP_WINDOW_SECONDS = 300; // 5 minutes

function extractEventId(body: SentryWebhookBody): string | null {
  const ev = body.data?.event;
  return ev?.event_id || ev?.id || body.data?.issue?.shortId || body.data?.issue?.id || null;
}

function buildClassifierInput(
  body: SentryWebhookBody,
  occurrencesLast24h: number,
): ClassifierInput {
  const ev = body.data?.event ?? {};
  const exc = ev.exception?.values?.[0];
  const frames = exc?.stacktrace?.frames ?? [];
  const top = frames.slice(-5).map((f) =>
    `${sanitizeString(f.filename ?? '?')}:${f.lineno ?? '?'} ${sanitizeString(f.function ?? '?')}`,
  );
  const tagsRaw = Array.isArray(ev.tags)
    ? Object.fromEntries(ev.tags.filter((t) => Array.isArray(t) && t.length === 2))
    : ev.tags ?? {};
  const tags = sanitizePayload(tagsRaw) as Record<string, unknown>;
  const title = sanitizeString(ev.title ?? exc?.value ?? ev.message ?? 'Unknown error');
  return {
    title: title.slice(0, 300),
    level: ev.level ?? null,
    culprit: ev.culprit ? sanitizeString(ev.culprit).slice(0, 300) : null,
    environment: ev.environment ?? null,
    release: ev.release ?? null,
    stackPreview: top.length ? top.join('\n').slice(0, 2000) : null,
    occurrencesLast24h,
    tags,
  };
}

function buildIssueBody(
  classifier: ReturnType<typeof unclassifiedResult>,
  input: ClassifierInput,
  sentryEventId: string,
  sentryIssueId: string | null,
): string {
  const lines: string[] = [];
  lines.push(`**Guardian classification:** \`${classifier.classification}\` (severity ${classifier.severity}/5)`);
  lines.push('');
  lines.push(`**Reason:** ${classifier.reason}`);
  if (classifier.suggestedFix) {
    lines.push('');
    lines.push(`**Suggested fix:**\n\n${classifier.suggestedFix}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`- Sentry event id: \`${sentryEventId}\``);
  if (sentryIssueId) lines.push(`- Sentry issue id: \`${sentryIssueId}\``);
  if (input.environment) lines.push(`- Environment: \`${input.environment}\``);
  if (input.release) lines.push(`- Release: \`${input.release}\``);
  lines.push(`- Occurrences last 24h: ${input.occurrencesLast24h}`);
  if (input.culprit) lines.push(`- Culprit: \`${input.culprit}\``);
  if (input.stackPreview) {
    lines.push('');
    lines.push('**Stack (sanitized, top 5 frames):**');
    lines.push('```');
    lines.push(input.stackPreview);
    lines.push('```');
  }
  lines.push('');
  lines.push('_Posted automatically by Dog Universe AI Guardian._');
  return lines.join('\n');
}

async function notifySuperadmins(title: string, message: string, metadata: Record<string, string>): Promise<void> {
  const supers = await prisma.user.findMany({
    where: { role: 'SUPERADMIN', deletedAt: null },
    select: { id: true },
  });
  await Promise.all(
    supers.map((u) =>
      createNotification({
        userId: u.id,
        type: 'ADMIN_MESSAGE',
        titleFr: title,
        titleEn: title,
        messageFr: message,
        messageEn: message,
        metadata,
      }),
    ),
  );
}

export async function POST(request: Request) {
  const secret = process.env.SENTRY_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('guardian', 'SENTRY_WEBHOOK_SECRET missing — refusing webhook');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  // C6 #1 — resource filter: drop noisy lifecycle/comment notifications early.
  const resource = request.headers.get('sentry-hook-resource');
  if (resource && !ALLOWED_RESOURCES.has(resource)) {
    return NextResponse.json({ skipped: true, reason: 'resource_filtered' }, { status: 200 });
  }

  // C6 #3 — timestamp window: reject replays older than 5 minutes.
  const tsHeader = request.headers.get('sentry-hook-timestamp');
  const tsNum = tsHeader ? Number(tsHeader) : NaN;
  if (!tsHeader || !Number.isFinite(tsNum)) {
    return NextResponse.json({ error: 'Invalid timestamp' }, { status: 401 });
  }
  const nowSec = Date.now() / 1000;
  if (Math.abs(nowSec - tsNum) > TIMESTAMP_WINDOW_SECONDS) {
    return NextResponse.json({ error: 'Timestamp out of window' }, { status: 401 });
  }

  const rawBody = await request.text();
  const signature =
    request.headers.get('sentry-hook-signature') || request.headers.get('x-sentry-signature');
  // C6 #2 — hex regex enforced inside verifySignature.
  if (!verifySignature(rawBody, signature, tsHeader, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: SentryWebhookBody;
  try {
    body = JSON.parse(rawBody) as SentryWebhookBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventId = extractEventId(body);
  if (!eventId) {
    return NextResponse.json({ skipped: true, reason: 'no_event_id' }, { status: 200 });
  }

  // Idempotency — Redis flag, fail-open.
  const fresh = await tryAcquireFlag(`sentry:event:${eventId}`, 24 * 3600);
  if (!fresh) {
    return NextResponse.json({ skipped: true, reason: 'duplicate' }, { status: 200 });
  }

  const sentryIssueId = body.data?.event?.issue?.id ?? body.data?.issue?.id ?? null;
  const projectSlug =
    body.data?.event?.project_slug ?? body.data?.issue?.project?.slug ?? null;

  // Occurrence count over last 24h — we approximate by counting GuardianEvent
  // rows for the same Sentry issue id (or, if absent, by sanitized title).
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const occurrencesLast24h =
    sentryIssueId !== null
      ? await prisma.guardianEvent.count({
          where: { sentryIssueId, createdAt: { gte: since } },
        })
      : 0;

  const classifierInput = buildClassifierInput(body, occurrencesLast24h);
  const result = await classifyEvent(classifierInput);

  let action: 'github_issue' | 'notify_admin' | 'silence' | 'unclassified' = result.suggestedAction;
  let githubIssueUrl: string | null = null;

  // Apply action with safety overrides.
  if (action === 'github_issue' && result.classification === 'bug_code' && occurrencesLast24h >= 3) {
    const fingerprintSeed = sentryIssueId ?? classifierInput.title;
    const issue = await openOrReuseIssue({
      fingerprintSeed,
      title: `[Guardian] ${classifierInput.title}`.slice(0, 250),
      body: buildIssueBody(result, classifierInput, eventId, sentryIssueId),
    });
    githubIssueUrl = issue?.url ?? null;
    if (!issue) {
      // Failed to open issue → degrade to admin notify so it doesn't get lost.
      action = 'notify_admin';
    }
  } else if (action === 'github_issue') {
    // Classifier asked for an issue but threshold not met → silence with note.
    action = 'silence';
  }

  if (action === 'notify_admin' || action === 'unclassified') {
    try {
      await notifySuperadmins(
        `Guardian: ${result.classification} (sev ${result.severity})`,
        `${classifierInput.title} — ${result.reason}`,
        { sentryEventId: eventId, classification: result.classification },
      );
    } catch (err) {
      logger.error('guardian', 'admin notification failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  try {
    await prisma.guardianEvent.create({
      data: {
        sentryEventId: eventId,
        sentryIssueId,
        projectSlug,
        title: classifierInput.title,
        culprit: classifierInput.culprit,
        level: classifierInput.level,
        classification: result.classification,
        severity: result.severity,
        action,
        reason: result.reason,
        githubIssueUrl,
        occurrencesSeen: occurrencesLast24h + 1,
      },
    });
  } catch (err) {
    // Unique constraint race — Sentry can fan-out duplicates faster than
    // our Redis flag in pathological cases. Treat as success.
    const code = (err as { code?: string }).code;
    if (code !== 'P2002') {
      logger.error('guardian', 'GuardianEvent create failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json(
    {
      ok: true,
      classification: result.classification,
      severity: result.severity,
      action,
      githubIssueUrl,
    },
    { status: 200 },
  );
}
