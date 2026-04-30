import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { deleteFromPrivateStorage } from '@/lib/supabase';
import { logAction, LOG_ACTIONS } from '@/lib/log';

// DELETE /api/admin/contracts/[id] — delete a contract (forces client to re-sign)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contract = await prisma.clientContract.findUnique({
    where: { id: id },
    select: { id: true, clientId: true, storageKey: true, signedAt: true, version: true },
  });

  if (!contract) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Delete from private Supabase Storage (non-blocking if it fails)
  if (contract.storageKey) {
    try {
      await deleteFromPrivateStorage(contract.storageKey);
    } catch (e) {
      console.warn(JSON.stringify({ level: 'warn', service: 'admin-contracts', message: 'Could not delete contract file from storage', error: e instanceof Error ? e.message : String(e), timestamp: new Date().toISOString() }));
    }
  }

  await prisma.clientContract.delete({ where: { id: id } });

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.CONTRACT_DELETED,
    entityType: 'ClientContract',
    entityId: id,
    details: {
      clientId: contract.clientId,
      version: contract.version,
      signedAt: contract.signedAt.toISOString(),
      storageKey: contract.storageKey,
    },
  });

  return NextResponse.json({ success: true });
}
