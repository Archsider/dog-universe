import { prisma } from '@/lib/prisma';
import { startOfTodayCasa, casablancaYMD } from '@/lib/dates-casablanca';
import type { VaccineExpiry } from '../shapes';

export async function loadVaccines(): Promise<VaccineExpiry[]> {
  const today = startOfTodayCasa();
  const horizon = new Date(today.getTime() + 30 * 86_400_000);
  const rows = await prisma.vaccination.findMany({
    where: {
      status: 'CONFIRMED',
      nextDueDate: { gte: today, lte: horizon },
      pet: { deletedAt: null, owner: { deletedAt: null, isWalkIn: false } },
    },
    select: {
      nextDueDate: true,
      vaccineType: true,
      pet: { select: { name: true, owner: { select: { name: true } } } },
    },
    orderBy: { nextDueDate: 'asc' },
    take: 10,
  });
  return rows
    .filter((r) => r.nextDueDate && r.pet)
    .map((r) => {
      const ymd = casablancaYMD(r.nextDueDate!);
      return {
        petName: r.pet!.name,
        ownerName: r.pet!.owner?.name ?? '',
        vaccineType: r.vaccineType,
        expiryYmd: `${ymd.year}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`,
      };
    });
}
