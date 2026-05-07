// SUPERADMIN-only — sends a minimal test email to validate the email pipeline
// end-to-end. No template, no Prisma side-effect — direct sendEmail() call.
// Rate-limited via the existing `passwordReset` bucket (5/h) at the middleware
// layer (see RATE_LIMITED_ROUTES_DIAGNOSTICS in middleware/rate-limit.ts).
import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { sendEmail } from '@/lib/email';
import { z } from 'zod';

const bodySchema = z.object({ to: z.string().email() });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let parsed: { to: string };
  try {
    const raw = await request.json();
    parsed = bodySchema.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_BODY' }, { status: 400 });
  }

  const now = new Date();
  try {
    await sendEmail({
      to: parsed.to,
      subject: 'Test diagnostique Dog Universe',
      html: `<p>Si tu lis ce message, l'envoi email fonctionne. <strong>${now.toISOString()}</strong></p>`,
      text: `Si tu lis ce message, l'envoi email fonctionne. ${now.toISOString()}`,
    });
    return NextResponse.json({ ok: true, sentAt: now.toISOString() });
  } catch (err) {
    // Mask provider details — only return a short message, never the stack
    // (could leak SMTP creds in some Nodemailer error paths).
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg.slice(0, 200) }, { status: 500 });
  }
}
