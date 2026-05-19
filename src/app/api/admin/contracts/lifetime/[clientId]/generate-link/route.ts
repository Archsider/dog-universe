// POST /api/admin/contracts/lifetime/[clientId]/generate-link
//
// Generates a magic-link for the owner of a permanent-resident pet to sign
// the lifetime boarding contract from their phone, no portal login needed.
//
// Behaviour :
//   - Voids any previous PENDING lifetime contract for the same (clientId, petId)
//     pair by switching it to EXPIRED so only one live link exists at a time.
//   - Mints a new HMAC-signed token (`<contractId>.<nonce>.<sig>`).
//   - Returns the public URL + a pre-built `wa.me` link to share via WhatsApp.
//
// Auth : ADMIN / SUPERADMIN.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { signLifetimeToken, TOKEN_TTL_MS } from '@/lib/lifetime-contracts';
import { logAction, LOG_ACTIONS } from '@/lib/log';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ clientId: string }> };

function getBaseUrl(req: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  // Fallback to the host header (dev / preview).
  const host = req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : 'https://doguniverse.ma';
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length < 8) return null;
  // 0XYZ → 212XYZ ; already-prefixed numbers pass through.
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `212${digits.slice(1)}`;
  return digits;
}

export async function POST(req: Request, { params }: Params) {
  const { clientId } = await params;
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const client = await prisma.user.findFirst({
    where: notDeleted({ id: clientId }),
    select: {
      id: true,
      name: true,
      phone: true,
      pets: {
        where: notDeleted({ isPermanentResident: true }),
        select: { id: true, name: true },
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
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  // Void any previous PENDING contract for this (client, pet) pair so the
  // newly issued link is the only live one. Already-SIGNED rows are kept
  // intact — admin may want to regenerate a NEW contract version even after
  // a previous signature (e.g. terms updated), so we don't touch SIGNED.
  await prisma.lifetimeContract.updateMany({
    where: { clientId, petId: pet.id, status: 'PENDING' },
    data: { status: 'EXPIRED', publicToken: null, publicTokenExpiresAt: null },
  });

  const contract = await prisma.lifetimeContract.create({
    data: {
      clientId,
      petId: pet.id,
      status: 'PENDING',
      version: '1.0',
      createdBy: session.user.id,
      publicTokenExpiresAt: expiresAt,
    },
    select: { id: true },
  });

  const token = signLifetimeToken(contract.id);
  await prisma.lifetimeContract.update({
    where: { id: contract.id },
    data: { publicToken: token },
  });

  const baseUrl = getBaseUrl(req);
  // next-intl `localePrefix: 'always'` — the path MUST include the locale.
  // We default to FR (Stephanie's language) ; the page itself is in French.
  const signUrl = `${baseUrl}/fr/contracts/lifetime/${token}`;

  // WhatsApp pre-built message — French (Stephanie's primary language).
  const phone = normalizePhone(client.phone);
  const waMessage = `Bonjour ${client.name?.split(' ')[0] ?? ''}, voici le lien pour signer le contrat de pension à vie de ${pet.name} : ${signUrl}\n\nLe contrat est à signer directement depuis votre téléphone — il vous suffit de signer avec le doigt à la fin du document. Vous recevrez ensuite le PDF signé.\n\nDog Universe`;
  const whatsappUrl = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(waMessage)}`
    : null;

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.CONTRACT_LIFETIME_GENERATED,
    entityType: 'User',
    entityId: clientId,
    details: {
      contractId: contract.id,
      petId: pet.id,
      petName: pet.name,
      expiresAt: expiresAt.toISOString(),
    },
  });

  return NextResponse.json({
    contractId: contract.id,
    signUrl,
    whatsappUrl,
    expiresAt: expiresAt.toISOString(),
    petName: pet.name,
    clientName: client.name,
  });
}
