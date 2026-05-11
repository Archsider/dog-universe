import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * CSP violation report sink.
 *
 * Tier 2 hardening (2026-05-09) — receives `Content-Security-Policy-Report-Only`
 * violation reports as POST bodies (either application/csp-report or application/json
 * payloads — modern browsers send both shapes). We log a structured warning to
 * stderr (Sentry picks it up automatically as a breadcrumb), but DO NOT write to
 * the database — CSP reports can be high-volume on a misconfigured policy and
 * we'd rather lose a few than blow up Postgres connections.
 *
 * Threat model:
 *  - Anonymous endpoint, public POST. Body is opaque JSON, never echoed back.
 *  - No auth, no session, no PII surface. Payload size capped at 16 KB.
 *  - Report-Only mode: violations DO NOT block the page; this endpoint is
 *    purely observational until we flip to enforce.
 *  - Rate-limited per IP (30/min) — a single tab with a misconfigured CSP
 *    can fire one report per script tag on every reload, drowning logs.
 *
 * Rollout: see docs/CSP_ROLLOUT.md.
 */

const MAX_BODY_BYTES = 16 * 1024; // 16 KB — generous; legitimate reports are < 2 KB.

// Fail-open rate-limit: 30 reports per minute per IP. Cheap defence against
// browsers that loop violations on every render.
let limiter: Ratelimit | null = null;
function getLimiter(): Ratelimit | null {
  if (limiter) return limiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(30, '60 s'),
    prefix: 'csp-report',
    analytics: false,
  });
  return limiter;
}

export async function POST(request: NextRequest) {
  try {
    // Per-IP rate-limit — drop silently if exceeded. We still 204 (no 429)
    // because the browser doesn't care and 4xx pollutes logs.
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';
    const rl = getLimiter();
    if (rl) {
      const { success } = await rl.limit(ip).catch(() => ({ success: true }));
      if (!success) return new NextResponse(null, { status: 204 });
    }

    // Browsers send CSP reports as either:
    //   - application/csp-report → { "csp-report": { ... } }
    //   - application/reports+json → [{ "type": "csp-violation", "body": { ... } }]
    //   - application/json (custom report-to)
    // We accept all three and normalise minimally for logging.
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 });
    }

    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 });
    }

    let report: unknown = null;
    try {
      report = JSON.parse(text);
    } catch {
      // Malformed body — log and return 204 (don't 4xx the browser; it'll
      // just retry and we lose nothing).
      console.warn(
        JSON.stringify({
          level: 'warn',
          service: 'csp',
          message: 'csp-report-malformed-json',
          contentType: request.headers.get('content-type'),
          length: text.length,
          timestamp: new Date().toISOString(),
        }),
      );
      return new NextResponse(null, { status: 204 });
    }

    // console.warn (not error) — Vercel classifies severity from the console
    // method. These are observability data, not failures.
    console.warn(
      JSON.stringify({
        level: 'warn',
        service: 'csp',
        message: 'csp-violation',
        userAgent: request.headers.get('user-agent') ?? null,
        contentType: request.headers.get('content-type') ?? null,
        violation: report,
        timestamp: new Date().toISOString(),
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'csp',
        message: 'csp-report-handler-failed',
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      }),
    );
  }

  // Always 204 — the browser doesn't care about the response, and a non-2xx
  // would just clutter logs.
  return new NextResponse(null, { status: 204 });
}
