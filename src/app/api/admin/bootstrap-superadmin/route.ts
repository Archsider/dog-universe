import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual, createHash } from 'crypto';
import { prisma } from '@/lib/prisma';

// One-time endpoint to promote a user to SUPERADMIN.
// Protected by SUPERADMIN_SECRET env var — must match exactly.
// Usage: POST /api/admin/bootstrap-superadmin
//        { "email": "your@email.com", "secret": "YOUR_SUPERADMIN_SECRET" }
export async function POST(req: NextRequest) {
  const secret = process.env.SUPERADMIN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SUPERADMIN_SECRET not configured' }, { status: 500 });
  }

  let email: string, providedSecret: string;
  try {
    const body = await req.json();
    email = body.email;
    providedSecret = body.secret;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!email || !providedSecret) {
    return NextResponse.json({ error: 'email and secret are required' }, { status: 400 });
  }

  // Constant-time comparison to prevent timing attacks
  const secretHash = createHash('sha256').update(secret).digest();
  const providedHash = createHash('sha256').update(providedSecret).digest();
  if (!timingSafeEqual(secretHash, providedHash)) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  await prisma.user.update({
    where: { email },
    data: { role: 'SUPERADMIN' },
  });

  return NextResponse.json({ success: true, message: `${email} is now SUPERADMIN` });
}
