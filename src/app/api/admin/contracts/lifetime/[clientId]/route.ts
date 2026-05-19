// GET /api/admin/contracts/lifetime/[clientId]
//
// Génère et renvoie un PDF de contrat de pension à vie pour un client
// (walk-in ou normal) ayant au moins un animal flagué `isPermanentResident`.
//
// Le PDF est généré à la volée, pas stocké — c'est un document à imprimer,
// faire signer au stylo par le propriétaire, et archiver manuellement.
//
// Use case : Stephanie Yanik / Mama (mai 2026). Le mécanisme reste générique
// pour tout futur résident permanent.
//
// Auth : ADMIN / SUPERADMIN.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { generateLifetimeContractPDF } from '@/lib/contract-pdf-lifetime';
import { logAction, LOG_ACTIONS } from '@/lib/log';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ clientId: string }> };

function describeDog(pet: {
  breed: string | null;
  gender: string | null;
  isNeutered: boolean | null;
  microchipNumber: string | null;
  notes: string | null;
}): string {
  const parts: string[] = [];
  if (pet.breed) parts.push(pet.breed);
  if (pet.gender === 'FEMALE') parts.push('femelle');
  else if (pet.gender === 'MALE') parts.push('mâle');
  if (pet.isNeutered === true) parts.push('stérilisée');
  if (pet.microchipNumber) parts.push(`identifiée (puce ${pet.microchipNumber})`);
  else parts.push('identifiée par puce électronique');
  // Notes contain free-text physical description (colours, markings…).
  // Append them last so the readable order is "breed, sex, status, notes".
  if (pet.notes && pet.notes.trim().length > 0) {
    // Strip line breaks for a one-liner description in the PDF box.
    parts.push(pet.notes.trim().replace(/\s+/g, ' '));
  }
  return parts.join(', ');
}

export async function GET(_req: Request, { params }: Params) {
  const { clientId } = await params;
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const client = await prisma.user.findFirst({
    where: notDeleted({ id: clientId }),
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      pets: {
        where: notDeleted({ isPermanentResident: true }),
        select: {
          id: true,
          name: true,
          gender: true,
          breed: true,
          isNeutered: true,
          microchipNumber: true,
          notes: true,
        },
        take: 1,
      },
    },
  });

  if (!client) {
    return NextResponse.json({ error: 'CLIENT_NOT_FOUND' }, { status: 404 });
  }
  if (client.pets.length === 0) {
    return NextResponse.json({ error: 'NO_PERMANENT_RESIDENT' }, { status: 400 });
  }

  const pet = client.pets[0];
  const genderLabel = pet.gender === 'FEMALE' ? 'Femelle' : pet.gender === 'MALE' ? 'Mâle' : 'Non précisé';

  const pdfBuffer = await generateLifetimeContractPDF({
    clientName: client.name ?? 'Propriétaire',
    clientEmail: client.email && !client.email.endsWith('@dog-universe.local') ? client.email : null,
    clientPhone: client.phone,
    dogName: pet.name,
    dogDescription: describeDog(pet),
    dogGender: genderLabel,
    contractDate: new Date(),
    version: '1.0',
  });

  // Audit trail — generation is logged (each download = one row).
  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.CONTRACT_LIFETIME_GENERATED,
    entityType: 'User',
    entityId: clientId,
    details: {
      petId: pet.id,
      petName: pet.name,
      clientName: client.name,
    },
  });

  const filename = `contrat-pension-a-vie-${client.name?.replace(/\s+/g, '-').toLowerCase() ?? 'client'}.pdf`;
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
