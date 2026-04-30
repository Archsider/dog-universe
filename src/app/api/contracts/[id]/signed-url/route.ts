import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { createSignedUrl } from '@/lib/supabase';

type Params = { params: Promise<{ id: string }> };

const SIGNED_URL_TTL_SECONDS = 900; // 15 min — aligné sur le défaut de createSignedUrl()

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const contract = await prisma.clientContract.findUnique({
    where: { id },
    select: { id: true, clientId: true, storageKey: true },
  });

  // 403 sans confirmer l'existence — un client ne doit pas pouvoir énumérer les IDs
  // de contrats des autres. On renvoie le même statut "Forbidden" pour "not found"
  // ET pour "not yours". Seul un ADMIN/SUPERADMIN reçoit un 404 explicite.
  const role = session.user.role;
  const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';

  if (!contract) {
    return NextResponse.json(
      { error: isAdmin ? 'Not found' : 'Forbidden' },
      { status: isAdmin ? 404 : 403 },
    );
  }

  if (!isAdmin && contract.clientId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!contract.storageKey) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let url: string;
  try {
    url = await createSignedUrl(contract.storageKey, SIGNED_URL_TTL_SECONDS);
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', service: 'contracts', message: 'Supabase signed-url error', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
    return NextResponse.json(
      { error: 'Storage temporarily unavailable' },
      { status: 503 },
    );
  }

  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();
  return NextResponse.json({ url, expiresAt });
}
