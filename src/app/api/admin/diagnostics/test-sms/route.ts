// SUPERADMIN-only — sends a minimal test SMS to validate the SMS gateway
// end-to-end. Direct sendSMS() call (no queue) so the operator gets an
// immediate ok/error result. Rate-limited via the existing `passwordReset`
// bucket (5/h) at the middleware layer.
import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { sendSMS } from '@/lib/sms';
import { z } from 'zod';

// Loose validation: digits + optional + and dashes/spaces. The sendSMS helper
// normalises Moroccan numbers internally.
const bodySchema = z.object({ to: z.string().min(6).max(20).regex(/^[+\d\s\-.]+$/) });

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
  const stamp = now.toISOString().slice(11, 16); // HH:MM
  try {
    const ok = await sendSMS(parsed.to, `Test Dog Universe ${stamp}`);
    if (!ok) {
      // sendSMS returns false silently when env vars are missing — surface that.
      return NextResponse.json({ ok: false, error: 'SMS_NOT_CONFIGURED' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, sentAt: now.toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg.slice(0, 200) }, { status: 500 });
  }
}
