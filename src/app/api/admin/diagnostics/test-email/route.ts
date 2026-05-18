// SUPERADMIN-only — sends a minimal test email to validate the email pipeline
// end-to-end. No template, no Prisma side-effect — direct sendEmail() call.
// Rate-limited via the existing `passwordReset` bucket (5/h) at the middleware
// layer (see RATE_LIMITED_ROUTES_DIAGNOSTICS in middleware/rate-limit.ts).
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { sendEmail } from '@/lib/email';
import { z } from 'zod';

const bodySchema = z.object({ to: z.string().email() });

export async function POST(request: Request) {
  const guard = await requireRole(['SUPERADMIN']);
  if (guard.error) return guard.error;

  let parsed: { to: string };
  try {
    const raw = await request.json();
    parsed = bodySchema.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_BODY' }, { status: 400 });
  }

  // Surface a precise "config_missing" code BEFORE attempting send, so
  // the SUPERADMIN sees exactly which Vercel env var is absent rather
  // than an opaque SMTP timeout. The list is duplicated server-side
  // (not relying on /api/admin/diagnostics' env booleans) so this
  // endpoint stands alone as a "is email actually working?" probe.
  if (process.env.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (!process.env.EMAIL_SERVER_HOST) missing.push('EMAIL_SERVER_HOST');
    if (!process.env.EMAIL_SERVER_USER) missing.push('EMAIL_SERVER_USER');
    if (!process.env.EMAIL_SERVER_PASSWORD) missing.push('EMAIL_SERVER_PASSWORD');
    if (missing.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'config_missing',
          missing,
          hint: 'Configure these env vars in Vercel → Project Settings → Environment Variables, then redeploy.',
        },
        { status: 503 },
      );
    }
  }

  const startedAt = Date.now();
  const now = new Date();
  try {
    await sendEmail({
      to: parsed.to,
      subject: 'Test diagnostique Dog Universe',
      html: `<p>Si tu lis ce message, l'envoi email fonctionne. <strong>${now.toISOString()}</strong></p>`,
      text: `Si tu lis ce message, l'envoi email fonctionne. ${now.toISOString()}`,
    });
    return NextResponse.json({
      ok: true,
      sentAt: now.toISOString(),
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    // Mask provider details — only return a short message, never the stack
    // (could leak SMTP creds in some Nodemailer error paths).
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: msg.slice(0, 200), durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
