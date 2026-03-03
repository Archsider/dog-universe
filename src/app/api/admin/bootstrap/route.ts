import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// One-time bootstrap route — DELETE after first use
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.BOOTSTRAP_SECRET ?? process.env.CRON_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const targetEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
  if (!targetEmail) {
    return NextResponse.json({ error: 'ADMIN_BOOTSTRAP_EMAIL env var not set' }, { status: 500 });
  }

  const existing = await prisma.user.findUnique({ where: { email: targetEmail } });

  if (existing) {
    await prisma.user.update({ where: { email: targetEmail }, data: { role: 'ADMIN' } });
    return NextResponse.json({ message: `${targetEmail} promoted to ADMIN` });
  }

  const tempPassword = crypto.randomBytes(16).toString('hex');
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  await prisma.user.create({
    data: {
      email: targetEmail,
      name: 'Admin',
      passwordHash,
      role: 'ADMIN',
      language: 'fr',
    },
  });

  // Password only returned once — store it immediately
  return NextResponse.json({ message: 'Admin account created', tempPassword });
}
