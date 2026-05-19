// POST /api/admin/cron-trigger/[name] — SUPERADMIN only.
//
// Generic manual trigger for any cron in CRON_NAMES.  Invokes the
// underlying /api/cron/<name> route server-to-server with the
// CRON_SECRET so it bypasses Vercel's scheduler.  Mirrors the
// pattern used by /api/admin/cron-trigger/purge-anonymized but
// works for every registered cron.
//
// Use cases :
//   - Vercel hasn't synced a newly-added cron schedule yet (the
//     "JAMAIS" badge on /admin/health right after merging a new cron)
//   - Operator wants to validate a config change without waiting for
//     the next tick
//   - Recovery after a missed run (cron-freshness watchdog flagged it)
//
// `purge-anonymized` keeps its dedicated route because it has extra
// audit/logging requirements and a longer maxDuration.

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { logAction } from '@/lib/log';
import { logger } from '@/lib/logger';
import { CRON_NAMES } from '@/lib/observability';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Params = { params: Promise<{ name: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const guard = await requireRole(['SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const { name } = await params;

  if (!(CRON_NAMES as readonly string[]).includes(name)) {
    return NextResponse.json({ error: 'UNKNOWN_CRON', name }, { status: 404 });
  }

  // purge-anonymized has its own dedicated endpoint with audit logging.
  if (name === 'purge-anonymized') {
    return NextResponse.json({
      error: 'USE_DEDICATED_ENDPOINT',
      hint: '/api/admin/cron-trigger/purge-anonymized',
    }, { status: 400 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET_NOT_SET' }, { status: 500 });
  }

  // Reconstruct the base URL from the request — works on Vercel preview /
  // production / local dev without needing an env var.
  const origin = new URL(req.url).origin;
  const cronUrl = `${origin}/api/cron/${name}`;

  const startedAt = Date.now();
  try {
    const r = await fetch(cronUrl, {
      method: 'GET',
      headers: {
        'x-cron-secret': cronSecret,
        // Some defineCron handlers check Authorization too (Vercel default).
        'authorization': `Bearer ${cronSecret}`,
      },
    });
    const durationMs = Date.now() - startedAt;
    const body = await r.text();
    let parsed: unknown = body;
    try { parsed = JSON.parse(body); } catch { /* keep raw text */ }

    await logAction({
      userId: session.user.id,
      action: 'CRON_MANUAL_TRIGGER',
      entityType: 'System',
      entityId: name,
      details: { status: r.status, durationMs },
    });

    return NextResponse.json({
      triggered: name,
      status: r.status,
      durationMs,
      response: parsed,
    }, { status: r.ok ? 200 : 502 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('admin-cron-trigger', 'manual_trigger_failed', { name, error: message });
    return NextResponse.json({
      error: 'TRIGGER_FAILED',
      detail: message,
      durationMs: Date.now() - startedAt,
    }, { status: 500 });
  }
}
