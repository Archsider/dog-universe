import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

// Route temporaire — À SUPPRIMER après utilisation
const SECRET = process.env.CRON_SECRET;
const TARGET_EMAIL = 'khtabe.mehdi@gmail.com';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (!SECRET || secret !== SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const existing = await prisma.user.findUnique({ where: { email: TARGET_EMAIL } });

  if (existing) {
    await prisma.user.update({
      where: { email: TARGET_EMAIL },
      data: { role: 'ADMIN' },
    });
    return NextResponse.json({ message: `✅ ${TARGET_EMAIL} est maintenant ADMIN` });
  }

  const passwordHash = await bcrypt.hash('ChangeMe2024!', 12);
  await prisma.user.create({
    data: {
      email: TARGET_EMAIL,
      name: 'Mehdi Khtabe',
      passwordHash,
      role: 'ADMIN',
      language: 'fr',
    },
  });

  return NextResponse.json({
    message: `✅ Compte ADMIN créé`,
    email: TARGET_EMAIL,
    password: 'ChangeMe2024! (change-le via reset mot de passe)',
  });
}
