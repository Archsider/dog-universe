import { addDays } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { startOfTodayCasa, casablancaStartOfDay, casablancaYMD } from '@/lib/dates-casablanca';
import { notDeleted } from '@/lib/prisma-soft';
import type { InactiveClient } from '../shapes';

export async function loadInactiveClients(): Promise<InactiveClient[]> {
  // Activity metric per Mehdi : max(lastBooking.startDate, lastPayment
  // .paymentDate). Anything older than 6 months → at-risk. Walk-in
  // clients excluded (they're one-shot). Limit to 3 for the dashboard
  // panel ; sidebar already exposes /admin/clients for the full list.
  const cutoff = casablancaStartOfDay(addDays(new Date(), -180));
  // Pull candidate clients with their last booking and last payment in
  // one query each, then merge in JS.
  const clients = await prisma.user.findMany({
    where: notDeleted({
      role: 'CLIENT',
      isWalkIn: false,
    }),
    select: {
      id: true,
      name: true,
      phone: true,
      bookings: {
        where: notDeleted(),
        select: {
          startDate: true,
          bookingPets: { select: { pet: { select: { name: true } } } },
        },
        orderBy: { startDate: 'desc' },
        take: 1,
      },
      invoices: {
        select: {
          payments: {
            select: { paymentDate: true },
            orderBy: { paymentDate: 'desc' },
            take: 1,
          },
        },
        orderBy: { issuedAt: 'desc' },
        take: 1,
      },
    },
  });

  const enriched = clients
    .map((c) => {
      const lastBooking = c.bookings[0]?.startDate ?? null;
      const lastPaymentRows = c.invoices.flatMap((inv) => inv.payments.map((p) => p.paymentDate));
      const lastPayment = lastPaymentRows.length > 0 ? lastPaymentRows[0] : null;
      const lastInteraction = [lastBooking, lastPayment]
        .filter((d): d is Date => d != null)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      const lastPetName = c.bookings[0]?.bookingPets[0]?.pet?.name ?? null;
      return { client: c, lastInteraction, lastPetName };
    })
    .filter((row) => row.lastInteraction != null && row.lastInteraction.getTime() < cutoff.getTime())
    .sort((a, b) => a.lastInteraction!.getTime() - b.lastInteraction!.getTime())
    .slice(0, 3);

  return enriched.map((row) => {
    const lastDate = row.lastInteraction!;
    const ymd = casablancaYMD(lastDate);
    const days = Math.round((startOfTodayCasa().getTime() - casablancaStartOfDay(lastDate).getTime()) / 86_400_000);
    return {
      clientId: row.client.id,
      clientName: row.client.name ?? '',
      clientPhone: row.client.phone,
      lastPetName: row.lastPetName,
      lastInteractionYmd: `${ymd.year}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`,
      daysSince: days,
    };
  });
}
