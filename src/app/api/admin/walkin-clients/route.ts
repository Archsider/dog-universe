import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// POST /api/admin/walkin-clients
// Crée un User léger (isWalkIn: true) par passager.
// Anti-doublon : si un walk-in avec le même suffixe téléphone (8 derniers chiffres)
// existe déjà, le retourne directement.
// body: { name: string, phone?: string }
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { name, phone } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'INVALID_NAME' }, { status: 400 });
  }

  const trimmedName = name.trim().slice(0, 100);
  const trimmedPhone =
    typeof phone === 'string' && phone.trim() ? phone.trim().slice(0, 30) : null;

  // Anti-doublon par téléphone : compare les 8 derniers chiffres
  if (trimmedPhone) {
    const digits = trimmedPhone.replace(/\D/g, '');
    const tail = digits.slice(-8);
    if (tail.length >= 8) {
      const existing = await prisma.user.findFirst({
        where: { isWalkIn: true, phone: { endsWith: tail } },
      });
      if (existing) return NextResponse.json(existing);
    }
  }

  // Email technique non-exposé, garanti unique
  const uid = randomUUID().replace(/-/g, '').slice(0, 16);
  const email = `walkin-${uid}@internal.doguniverse.local`;

  const user = await prisma.user.create({
    data: {
      name: trimmedName,
      phone: trimmedPhone,
      email,
      // Placeholder non-bcrypt → login portal impossible
      passwordHash: `WALKIN_NO_ACCESS_${randomUUID().replace(/-/g, '')}`,
      role: 'CLIENT',
      isWalkIn: true,
    },
  });

  return NextResponse.json(user, { status: 201 });
}
