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
// If step 5 does NOT happen, the operator now knows exactly which step
// to check (Sentry DSN configured? webhook URL+secret correct? Anthropic
// key present? GitHub PAT present?).

import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
// 10 s is plenty — we throw immediately, the rest is just the
// Sentry SDK's unhandled-rejection capture.
export const maxDuration = 10;

export async function POST() {
  const session = await auth();
  if (session?.user?.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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

  // The throw is the entire point. Sentry's Next.js SDK auto-captures
  // unhandled errors from route handlers. We never reach the line below.
  throw new Error(canaryId);
}
