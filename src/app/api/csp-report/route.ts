import { NextRequest, NextResponse } from 'next/server';

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
 *
 * Rollout: see docs/CSP_ROLLOUT.md.
 */

const MAX_BODY_BYTES = 16 * 1024; // 16 KB — generous; legitimate reports are < 2 KB.

export async function POST(request: NextRequest) {
  try {
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
      console.error(
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

    console.error(
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
