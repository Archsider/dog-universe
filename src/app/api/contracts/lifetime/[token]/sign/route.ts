// POST /api/contracts/lifetime/[token]/sign
//
// Public endpoint — no portal login required.  Authenticated by the HMAC
// token in the URL and by the contract state (must be PENDING + not
// expired).  Generates the signed PDF, uploads it to the private bucket,
// flips the contract to SIGNED, and returns a fresh 1h download URL.

import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { verifyLifetimeToken } from '@/lib/lifetime-contracts';
import { generateLifetimeContractPDF } from '@/lib/contract-pdf-lifetime';
import { uploadBufferPrivate, createSignedUrl } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { withSpan } from '@/lib/observability';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ token: string }> };

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
  if (pet.notes && pet.notes.trim().length > 0) {
    parts.push(pet.notes.trim().replace(/\s+/g, ' '));
  }
  return parts.join(', ');
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const contractId = verifyLifetimeToken(token);
  if (!contractId) {
    return NextResponse.json({ error: 'INVALID_TOKEN' }, { status: 401 });
  }

  let signatureDataUrl: string;
  try {
    const body = await req.json();
    signatureDataUrl = body.signatureDataUrl;
    if (!signatureDataUrl || !signatureDataUrl.startsWith('data:image/png;base64,')) {
      return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 400 });
    }
    if (signatureDataUrl.length > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'SIGNATURE_TOO_LARGE' }, { status: 400 });
    }
    const base64Data = signatureDataUrl.split(',')[1] ?? '';
    if (base64Data.length < 1500) {
      return NextResponse.json({ error: 'SIGNATURE_EMPTY' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const contract = await prisma.lifetimeContract.findUnique({
    where: { id: contractId },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      pet: {
        select: {
          id: true,
          name: true,
          gender: true,
          breed: true,
          isNeutered: true,
          microchipNumber: true,
          notes: true,
        },
      },
    },
  });

  if (!contract || contract.publicToken !== token) {
    return NextResponse.json({ error: 'CONTRACT_NOT_FOUND' }, { status: 404 });
  }
  if (contract.status === 'SIGNED') {
    return NextResponse.json({ error: 'ALREADY_SIGNED' }, { status: 409 });
  }
  if (contract.status === 'REVOKED') {
    return NextResponse.json({ error: 'REVOKED' }, { status: 410 });
  }
  if (
    contract.publicTokenExpiresAt &&
    contract.publicTokenExpiresAt.getTime() < Date.now()
  ) {
    // Lazy expiry — flip the row + return 410.
    await prisma.lifetimeContract.update({
      where: { id: contract.id },
      data: { status: 'EXPIRED', publicToken: null },
    });
    return NextResponse.json({ error: 'EXPIRED' }, { status: 410 });
  }

  // Defence : the pet must still exist and be flagged permanent resident.
  const pet = await prisma.pet.findFirst({
    where: notDeleted({ id: contract.petId, isPermanentResident: true }),
    select: { id: true },
  });
  if (!pet) {
    return NextResponse.json({ error: 'PET_NOT_PERMANENT_RESIDENT' }, { status: 400 });
  }

  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    undefined;
  const userAgent = req.headers.get('user-agent') ?? undefined;

  const signedAt = new Date();
  const storageKey = `contracts-lifetime/${contract.id}/${Date.now()}-${randomUUID().slice(0, 8)}.pdf`;

  const genderLabel =
    contract.pet.gender === 'FEMALE' ? 'Femelle' :
    contract.pet.gender === 'MALE' ? 'Mâle' : 'Non précisé';

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateLifetimeContractPDF({
      clientName: contract.client.name ?? 'Propriétaire',
      clientEmail: contract.client.email && !contract.client.email.endsWith('@dog-universe.local') ? contract.client.email : null,
      clientPhone: contract.client.phone,
      dogName: contract.pet.name,
      dogDescription: describeDog(contract.pet),
      dogGender: genderLabel,
      contractDate: signedAt,
      version: contract.version,
      signatureDataUrl,
      signedAt,
      ipAddress: ipAddress ?? null,
    });
  } catch (err) {
    logger.error('lifetime-contracts', 'PDF_GENERATION_FAILED', {
      contractId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'PDF_GENERATION_FAILED' }, { status: 500 });
  }

  try {
    await uploadBufferPrivate(pdfBuffer, storageKey, 'application/pdf');
  } catch (err) {
    logger.error('lifetime-contracts', 'STORAGE_UPLOAD_FAILED', {
      contractId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'STORAGE_UPLOAD_FAILED' }, { status: 500 });
  }

  await withSpan(
    'api.lifetime-contracts.sign',
    { contractId, clientId: contract.clientId, petId: contract.petId },
    () =>
      prisma.lifetimeContract.update({
        where: { id: contract.id },
        data: {
          status: 'SIGNED',
          signedAt,
          storageKey,
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ? userAgent.slice(0, 500) : null,
          // Keep the token alive — the owner can re-download the signed PDF
          // via the same link as long as it doesn't expire.  The PENDING
          // gate is enforced by `status`, not by the presence of the token.
        },
      }),
  );

  await logAction({
    userId: contract.clientId,
    action: LOG_ACTIONS.CONTRACT_LIFETIME_SIGNED,
    entityType: 'LifetimeContract',
    entityId: contract.id,
    details: {
      petId: contract.petId,
      petName: contract.pet.name,
      signedAt: signedAt.toISOString(),
    },
  });

  let downloadUrl: string | null = null;
  try {
    downloadUrl = await createSignedUrl(storageKey, 3600);
  } catch (err) {
    logger.error('lifetime-contracts', 'SIGNED_URL_FAILED', {
      contractId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({
    success: true,
    downloadUrl,
    signedAt: signedAt.toISOString(),
  });
}
