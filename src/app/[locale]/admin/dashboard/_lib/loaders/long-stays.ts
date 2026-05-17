import { addDays } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { startOfTodayCasa, casablancaStartOfDay, casablancaYMD } from '@/lib/dates-casablanca';
import { notDeleted } from '@/lib/prisma-soft';
import type { LongStayItem } from '../shapes';

export async function loadLongStays(): Promise<LongStayItem[]> {
  // IN_PROGRESS only, per brief. Boarding stays > 21 days that are
  // physically in the kennel — surface to the operator so they can
  // proactively reach out to the client via WhatsApp.
  const cutoff = casablancaStartOfDay(addDays(new Date(), -21));
  const rows = await prisma.booking.findMany({
    where: notDeleted({
      serviceType: 'BOARDING',
      status: 'IN_PROGRESS',
      startDate: { lt: cutoff },
    }),
    select: {
      id: true,
      startDate: true,
      client: { select: { name: true, phone: true } },
      bookingPets: { select: { pet: { select: { name: true } } } },
    },
    orderBy: { startDate: 'asc' },
    take: 5,
  });
  return rows.map((b) => {
    const ymd = casablancaYMD(b.startDate);
    const start = casablancaStartOfDay(b.startDate);
    const today = startOfTodayCasa();
    const daysIn = Math.round((today.getTime() - start.getTime()) / 86_400_000);
    return {
      bookingId: b.id,
      petName: b.bookingPets[0]?.pet?.name ?? '',
      ownerName: b.client.name ?? '',
      ownerPhone: b.client.phone,
      startDateYmd: `${ymd.year}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`,
      daysInPension: daysIn,
    };
  });
}
