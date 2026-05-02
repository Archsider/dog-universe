import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// POST /api/admin/walkin-clients
// Crée un User léger (isWalkIn: true) par passager.
// Anti-doublon : si un walk-in avec le même suffixe téléphone (8 derniers chiffres)
// existe déjà, le retourne directement.
// body: { name: string, phone?: string }
// ---------------------------------------------------------------------------

const walkInSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^(\+212|0)[5-7]\d{8}$/, 'INVALID_PHONE_FORMAT')
    .max(30)
    .optional()
    .nullable(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // P1-2: Zod validation — phone format marocain + name constraints
  const rawBody = await request.json().catch(() => ({}));
  const parsed = walkInSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    const code = firstError?.message === 'INVALID_PHONE_FORMAT' ? 'INVALID_PHONE_FORMAT' : 'INVALID_INPUT';
    return NextResponse.json({ error: code, details: parsed.error.errors }, { status: 400 });
  }
  const { name, phone } = parsed.data;

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
      // SECURITY (P2): explicit `select` — never echo passwordHash / tokenVersion / loyalty internals
      // back to the admin client. Even though admins are trusted, leaking the (placeholder) hash
      // widens the blast radius of any future XSS in the admin UI and shows up in browser devtools.
      const safeWalkInSelect = {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        isWalkIn: true,
      };
      // 1. Correspondance exacte sur le numéro normalisé (évite toute collision)
      const exactMatch = await prisma.user.findFirst({
        where: { isWalkIn: true, phone: { endsWith: normalized }, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
        select: safeWalkInSelect,
      });
      if (exactMatch) return NextResponse.json(exactMatch);

      // 2. Fallback : 8 derniers chiffres — absorbe variantes de formatage historiques
      //    Seulement si le numéro normalisé fait plus de 8 chiffres (sinon redondant avec l'étape 1)
      const tail = normalized.slice(-8);
      if (normalized.length > 8) {
        const fuzzyMatch = await prisma.user.findFirst({
          where: { isWalkIn: true, phone: { endsWith: tail }, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
          select: safeWalkInSelect,
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
