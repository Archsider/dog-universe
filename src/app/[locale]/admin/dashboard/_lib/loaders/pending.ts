import { prisma } from '@/lib/prisma';
import type { PendingSnapshot } from '../shapes';

export async function loadPending(): Promise<PendingSnapshot> {
  const count = await prisma.booking.count({
    where: { status: 'PENDING', deletedAt: null },
  });
  return { count };
}
