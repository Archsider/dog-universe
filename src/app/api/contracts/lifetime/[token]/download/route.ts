// GET /api/contracts/lifetime/[token]/download
//
// Public endpoint — mints a fresh 1 h signed URL for the signed PDF.  Only
// works once the contract reaches SIGNED.  Used by the public confirmation
// page to allow the owner to re-download their copy after signing.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyLifetimeToken } from '@/lib/lifetime-contracts';
import { createSignedUrl } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { token } = await params;
  const contractId = verifyLifetimeToken(token);
  if (!contractId) {
    return NextResponse.json({ error: 'INVALID_TOKEN' }, { status: 401 });
  }

  const contract = await prisma.lifetimeContract.findUnique({
    where: { id: contractId },
    select: {
      publicToken: true,
      status: true,
      storageKey: true,
      signedAt: true,
    },
  });

  if (!contract || contract.publicToken !== token) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (contract.status !== 'SIGNED' || !contract.storageKey) {
    return NextResponse.json({ error: 'NOT_SIGNED_YET' }, { status: 409 });
  }

  try {
    const downloadUrl = await createSignedUrl(contract.storageKey, 3600, {
      download: 'Mama_Lifetime_Boarding_Agreement_2026.pdf',
    });
    return NextResponse.json({
      downloadUrl,
      signedAt: contract.signedAt?.toISOString(),
    });
  } catch (err) {
    logger.error('lifetime-contracts', 'DOWNLOAD_URL_FAILED', {
      contractId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'STORAGE_ERROR' }, { status: 500 });
  }
}
