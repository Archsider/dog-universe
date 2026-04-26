import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { passwordChangeSchema, formatZodError } from '@/lib/validation';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = passwordChangeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }
  const { oldPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, passwordHash: true },
  });

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const valid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!valid) {
    const msg = session.user.language === 'fr' ? 'Mot de passe actuel incorrect' : 'Incorrect current password';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  // Increment tokenVersion to invalidate all existing sessions immediately
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, tokenVersion: { increment: 1 } } });
  return NextResponse.json({ success: true });
}
