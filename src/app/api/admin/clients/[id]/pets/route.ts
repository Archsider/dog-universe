// Admin-only pet creation for any client. Used primarily by the walk-in
// booking flow where the admin enters minimal pet info (name, species, DOB)
// at the front desk for a passing customer with no existing portal account.
//
// The owner-side route /api/pets POST creates pets only for the
// session.user.id — admins need to create pets *for* a client.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';

interface PetInput {
  name: string;
  species: 'DOG' | 'CAT';
  dateOfBirth: string;
  breed?: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
}

function isValidPet(p: unknown): p is PetInput {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.name === 'string' && o.name.trim().length > 0 && o.name.length <= 60 &&
    (o.species === 'DOG' || o.species === 'CAT') &&
    typeof o.dateOfBirth === 'string' && !Number.isNaN(Date.parse(o.dateOfBirth))
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: clientId } = await params;

  // Verify the target is an actual CLIENT (not another admin / soft-deleted).
  const client = await prisma.user.findFirst({
    where: { id: clientId, role: 'CLIENT', deletedAt: null },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  let body: { pets?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  // Accept either a single pet or an array — the walk-in flow batches.
  const rawPets = Array.isArray(body.pets) ? body.pets : [body.pets];
  if (rawPets.length === 0 || rawPets.length > 10) {
    return NextResponse.json({ error: 'INVALID_PETS_COUNT' }, { status: 400 });
  }
  if (!rawPets.every(isValidPet)) {
    return NextResponse.json({ error: 'INVALID_PET_DATA' }, { status: 400 });
  }

  const created = await prisma.$transaction(
    rawPets.map(p => prisma.pet.create({
      data: {
        ownerId: clientId,
        name: p.name.trim().slice(0, 60),
        species: p.species,
        dateOfBirth: new Date(p.dateOfBirth),
        breed: p.breed?.trim().slice(0, 60) || null,
        gender: p.gender ?? null,
      },
      select: { id: true, name: true, species: true },
    })),
  );

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.PET_CREATED,
    entityType: 'Pet',
    entityId: created.map(p => p.id).join(','),
    details: { count: created.length, ownerClientId: clientId, source: 'ADMIN_BATCH' },
  }).catch(() => { /* logging is non-critical */ });

  return NextResponse.json({ pets: created }, { status: 201 });
}
