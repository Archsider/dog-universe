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

  // Anti-doublon par téléphone
  // Normalisation : garde uniquement les chiffres, retire le préfixe pays 212 (Maroc)
  // Ex : "+212 6 12 34 56 78" → "612345678"  /  "0612345678" → "612345678"
  if (trimmedPhone) {
    const digits = trimmedPhone.replace(/\D/g, '');
    const normalized = digits.startsWith('212') ? digits.slice(3) : digits.replace(/^0/, '');

    if (normalized.length >= 8) {
      // 1. Correspondance exacte sur le numéro normalisé (évite toute collision)
      const exactMatch = await prisma.user.findFirst({
        where: { isWalkIn: true, phone: { endsWith: normalized }, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
      });
      if (exactMatch) return NextResponse.json(exactMatch);

      // 2. Fallback : 8 derniers chiffres — absorbe variantes de formatage historiques
      //    Seulement si le numéro normalisé fait plus de 8 chiffres (sinon redondant avec l'étape 1)
      const tail = normalized.slice(-8);
      if (normalized.length > 8) {
        const fuzzyMatch = await prisma.user.findFirst({
          where: { isWalkIn: true, phone: { endsWith: tail }, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
        });
        if (fuzzyMatch) return NextResponse.json(fuzzyMatch);
      }
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

  return NextResponse.json({
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    isWalkIn: user.isWalkIn,
  }, { status: 201 });
}
