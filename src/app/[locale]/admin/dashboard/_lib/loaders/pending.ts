import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import type { PendingSnapshot } from '../shapes';

export async function loadPending(): Promise<PendingSnapshot> {
  const count = await prisma.booking.count({
    where: notDeleted({ status: 'PENDING' }),
  });
  return { count };
}
