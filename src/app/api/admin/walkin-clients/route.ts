import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { withSpan } from '@/lib/observability';

// ---------------------------------------------------------------------------
// POST /api/admin/walkin-clients
// Crée un User léger (isWalkIn: true) par passager.
// Anti-doublon : si un walk-in avec le même suffixe téléphone (8 derniers chiffres)
// existe déjà, le retourne directement.
// body: { name: string, phone?: string }
// ---------------------------------------------------------------------------

const walkInSchema = z.object({
  name: z.string().trim().min(1).max(100),
  // Walk-in phone = simple contact note (pas un login, pas de portail). On
  // tolère TOUT numéro plausible : étranger, fixe, ou marocain — pas de
  // format imposé qui bloquerait la création du client. Normalise (strip
  // séparateurs) puis accepte 6–15 chiffres avec un éventuel "+". Empty =
  // pas de téléphone. La dédup utilise les 8 derniers chiffres.
  phone: z
    .string()
    .trim()
    .max(40)
    .transform((s) => s.replace(/[\s.\-()]/g, ''))
    .refine((s) => s === '' || /^\+?\d{6,15}$/.test(s), 'INVALID_PHONE_FORMAT')
    .transform((s) => (s === '' ? null : s))
    .optional()
    .nullable(),
});

export async function POST(request: Request) {
  const authResult = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (authResult.error) return authResult.error;
  const { session } = authResult;

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
        where: notDeleted({ isWalkIn: true, phone: { endsWith: normalized } }),
        select: safeWalkInSelect,
      });
      if (exactMatch) return NextResponse.json(exactMatch);

      // 2. Fallback : 8 derniers chiffres — absorbe variantes de formatage historiques
      //    Seulement si le numéro normalisé fait plus de 8 chiffres (sinon redondant avec l'étape 1)
      const tail = normalized.slice(-8);
      if (normalized.length > 8) {
        const fuzzyMatch = await prisma.user.findFirst({
          where: notDeleted({ isWalkIn: true, phone: { endsWith: tail } }),
          select: safeWalkInSelect,
        });
        if (fuzzyMatch) return NextResponse.json(fuzzyMatch);
      }
    }
  }

  // Email technique non-exposé, garanti unique
  const uid = randomUUID().replace(/-/g, '').slice(0, 16);
  const email = `walkin-${uid}@internal.doguniverse.local`;

  // Walk-in : name often a single word (e.g. "Paul"). Split when possible,
  // otherwise reuse the same value for both — required by NOT NULL on firstName/lastName.
  const parts = trimmedName.split(/\s+/);
  const walkInFirstName = parts[0] || trimmedName;
  const walkInLastName = parts.slice(1).join(' ') || walkInFirstName;

  const user = await withSpan(
    'api.admin.walkin-clients.create',
    { actorId: session.user.id, hasEmail: !!email },
    () => prisma.user.create({
      data: {
        firstName: walkInFirstName,
        lastName: walkInLastName,
        name: trimmedName,
        phone: trimmedPhone,
        email,
        // Placeholder non-bcrypt → login portal impossible
        passwordHash: `WALKIN_NO_ACCESS_${randomUUID().replace(/-/g, '')}`,
        role: 'CLIENT',
        isWalkIn: true,
      },
    }),
  );

  return NextResponse.json({
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    isWalkIn: user.isWalkIn,
  }, { status: 201 });
}
