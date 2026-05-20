// GET /api/health-passport/[token]
//
// Public read-only endpoint serving a Pet Health Passport via an HMAC
// token (signed by the owner or an admin via POST /api/pets/[id]/passport).
//
// PII reduction:
//   - Owner first name only (no email, no phone, no last name)
//   - No bookings, no admin notes, no financials
//   - Veterinarian phone IS included (relevant to whoever needs the passport)
//
// Expiry is checked by verifyPassportToken without DB hit (embedded in
// the signed payload).

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { verifyPassportToken } from '@/lib/pet-passport-token';
import { logger } from '@/lib/logger';

type Params = { params: Promise<{ token: string }> };

const HEADERS = {
  'Cache-Control': 'no-store, private',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

export async function GET(request: Request, { params }: Params) {
  const { token } = await params;

  const verified = verifyPassportToken(token);
  if (!verified) {
    // Avoid timing attacks — same shape & cost regardless of why we rejected.
    logger.warn('pet-passport', 'unauthorized access', {
      event: 'invalid_or_expired',
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      tokenPrefix: typeof token === 'string' ? token.slice(0, 8) : null,
    });
    return NextResponse.json({ error: 'INVALID_OR_EXPIRED' }, { status: 410, headers: HEADERS });
  }

  const pet = await prisma.pet.findFirst({
    where: notDeleted({ id: verified.petId }),
    select: {
      id: true,
      name: true,
      species: true,
      breed: true,
      dateOfBirth: true,
      gender: true,
      photoUrl: true,
      isNeutered: true,
      microchipNumber: true,
      tattooNumber: true,
      weight: true,
      vetName: true,
      vetPhone: true,
      allergies: true,
      currentMedication: true,
      lastAntiparasiticDate: true,
      antiparasiticProduct: true,
      antiparasiticDurationDays: true,
      vaccinations: {
        where: { status: 'CONFIRMED' },
        orderBy: { date: 'desc' },
        take: 20,
        select: {
          id: true,
          vaccineType: true,
          date: true,
          nextDueDate: true,
        },
      },
      owner: {
        select: { firstName: true, name: true },
      },
    },
  });

  if (!pet) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404, headers: HEADERS });
  }

  // First name only, fall back to splitting `name` (legacy single-field).
  const ownerFirstName = pet.owner?.firstName
    ?? (pet.owner?.name?.split(/\s+/)[0] ?? null);

  return NextResponse.json(
    {
      pet: {
        id: pet.id,
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        dateOfBirth: pet.dateOfBirth?.toISOString() ?? null,
        gender: pet.gender,
        photoUrl: pet.photoUrl,
        isNeutered: pet.isNeutered,
        microchipNumber: pet.microchipNumber,
        tattooNumber: pet.tattooNumber,
        weight: pet.weight,
        vetName: pet.vetName,
        vetPhone: pet.vetPhone,
        allergies: pet.allergies,
        currentMedication: pet.currentMedication,
        lastAntiparasiticDate: pet.lastAntiparasiticDate?.toISOString() ?? null,
        antiparasiticProduct: pet.antiparasiticProduct,
        antiparasiticDurationDays: pet.antiparasiticDurationDays,
        vaccinations: pet.vaccinations.map(v => ({
          id: v.id,
          vaccineType: v.vaccineType,
          date: v.date?.toISOString() ?? null,
          nextDueDate: v.nextDueDate?.toISOString() ?? null,
        })),
      },
      ownerFirstName,
      expiresAt: verified.expiresAt.toISOString(),
    },
    { headers: HEADERS },
  );
}
