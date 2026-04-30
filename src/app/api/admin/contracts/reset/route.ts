import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { deleteFromPrivateStorage } from '@/lib/supabase';
import { logAction } from '@/lib/log';

// POST /api/admin/contracts/reset
// Body: { clientEmail: string }
// Supprime le contrat signé d'un client identifié par email.
// Utilisé par les tests E2E pour réinitialiser un compte test entre runs.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { clientEmail?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const clientEmail = typeof body.clientEmail === 'string' ? body.clientEmail.toLowerCase().trim() : null;
  if (!clientEmail) {
    return NextResponse.json({ error: 'MISSING_CLIENT_EMAIL' }, { status: 400 });
  }

  const client = await prisma.user.findUnique({
    where: { email: clientEmail },
    select: { id: true, role: true },
  });

  if (!client || client.role !== 'CLIENT') {
    return NextResponse.json({ error: 'CLIENT_NOT_FOUND' }, { status: 404 });
  }

  const contract = await prisma.clientContract.findUnique({
    where: { clientId: client.id },
    select: { id: true, storageKey: true },
  });

  if (!contract) {
    return NextResponse.json({ message: 'no_contract', alreadyEmpty: true });
  }

  if (contract.storageKey) {
    try {
      await deleteFromPrivateStorage(contract.storageKey);
    } catch (e) {
      console.warn(JSON.stringify({ level: 'warn', service: 'admin-contracts', message: 'Could not delete contract file from storage', error: e instanceof Error ? e.message : String(e), timestamp: new Date().toISOString() }));
    }
  }

  await prisma.clientContract.delete({ where: { id: contract.id } });

  await logAction({
    userId: session.user.id,
    action: 'CONTRACT_RESET',
    entityType: 'ClientContract',
    entityId: contract.id,
    details: { clientEmail, contractId: contract.id },
  });

  return NextResponse.json({ message: 'reset', contractId: contract.id });
}
