// POST /api/admin/diag/throw-test-error — SUPERADMIN only.
//
// Throws an identifiable error captured by Sentry, so the operator can
// validate the end-to-end Guardian pipeline:
//
//   Vercel runtime → Sentry → Sentry webhook → /api/webhooks/sentry
//     → GuardianEvent row → (Anthropic Haiku classify)
//     → action (GH issue / SUPERADMIN notif / silence)
//
// The thrown message is `guardian_canary_<requestId>` so it's
// unmissable in Sentry's issue title and easy to filter out in
// /admin/guardian. Sentry should index it as a NEW issue every call
// (each requestId is unique) — that's the whole point: every call
// must traverse the full pipeline.
//
// SECURITY:
//   - SUPERADMIN-only (auth + role check before the throw).
//   - The route logs the requestId before throwing so the operator
//     can correlate Vercel logs / Sentry issue / Guardian DB row
//     against a single ID.
//
// USE CASE:
//   1. Operator clicks "Test Sentry pipeline" in /admin/guardian.
//   2. This route fires, Vercel reports the unhandled error to Sentry.
//   3. Sentry posts the webhook to /api/webhooks/sentry.
//   4. Webhook persists a GuardianEvent row.
//   5. /admin/guardian shows the new row → pipeline confirmed working.
//
// If step 5 does NOT happen, see docs/SENTRY_INTEGRATION.md for the
// checklist (DSN env var pointing at the right project, webhook secret
// configured, Anthropic key present, GitHub PAT present).

import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { requireRole } from '@/lib/auth-guards';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
// 10 s is plenty — we throw immediately, the rest is just the
// Sentry SDK's unhandled-rejection capture.
export const maxDuration = 10;

export async function POST() {
  const authResult = await requireRole(['SUPERADMIN']);
  if (authResult.error) return authResult.error;
  const { session } = authResult;

  // Build the canary id BEFORE the throw so it lands in both the
  // Vercel structured log AND the Sentry error message — same string,
  // findable in both places.
  const ts = new Date().toISOString();
  const random = Math.random().toString(36).slice(2, 8);
  const canaryId = `guardian_canary_${ts.replace(/[:.]/g, '-')}_${random}`;

  logger.info('guardian-canary', 'about to throw canary error', {
    canaryId,
    actorId: session.user.id,
  });

  const err = new Error(canaryId);

  // Belt-and-suspenders capture. Next 15's `onRequestError` (wired in
  // `src/instrumentation.ts`) should already auto-capture the throw below,
  // but if that hook ever regresses (Next bump, Sentry SDK bump, plugin
  // mis-config) the canary would silently lose the entire diag — exactly
  // the failure mode this endpoint is meant to detect. Calling
  // captureException here + a short flush guarantees Sentry receives the
  // event even when the implicit fan-out is broken.
  Sentry.captureException(err, {
    tags: { canary: 'guardian', actorRole: 'SUPERADMIN' },
    extra: { canaryId, actorId: session.user.id },
  });
  // Flush before the throw kills the function context. 2 s is enough for a
  // single envelope on a warm Lambda; we don't await indefinitely because
  // Vercel kills the function after maxDuration anyway.
  await Sentry.flush(2_000).catch(() => {});

  // The throw is the entire point — exercises the implicit `onRequestError`
  // path on top of the explicit capture above. If only one of the two
  // produces an issue in Sentry, we know exactly which rail is broken.
  throw err;
}
