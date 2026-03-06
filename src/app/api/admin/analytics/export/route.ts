import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { fr } from 'date-fns/locale';

export async function GET() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  const rows: string[] = [];

  // Header
  rows.push(['Mois', 'Pension (MAD)', 'Toilettage (MAD)', 'Taxi (MAD)', 'Total (MAD)'].join(','));

  // Last 12 months
  for (let i = 11; i >= 0; i--) {
    const monthDate = subMonths(now, i);
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);

    const invoices = await prisma.invoice.findMany({
      where: { status: 'PAID', paidAt: { gte: start, lte: end } },
      select: {
        amount: true,
        booking: { select: { serviceType: true, boardingDetail: { select: { groomingPrice: true } } } },
      },
    });

    let boarding = 0, grooming = 0, taxi = 0;
    for (const inv of invoices) {
      if (inv.booking?.serviceType === 'PET_TAXI') {
        taxi += inv.amount;
      } else if (inv.booking?.serviceType === 'BOARDING') {
        const g = inv.booking.boardingDetail?.groomingPrice ?? 0;
        grooming += g;
        boarding += inv.amount - g;
      }
    }

    const label = format(monthDate, 'MMMM yyyy', { locale: fr });
    rows.push([label, boarding.toFixed(2), grooming.toFixed(2), taxi.toFixed(2), (boarding + grooming + taxi).toFixed(2)].join(','));
  }

  rows.push('');

  // Summary block
  const totalClients = await prisma.user.count({ where: { role: 'CLIENT' } });
  const totalRevenue = await prisma.invoice.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } });
  const totalBookings = await prisma.booking.count({ where: { status: 'COMPLETED' } });

  rows.push(['Résumé global', ''].join(','));
  rows.push(['Clients totaux', totalClients].join(','));
  rows.push(['Chiffre d\'affaires total (MAD)', (totalRevenue._sum.amount ?? 0).toFixed(2)].join(','));
  rows.push(['Séjours terminés', totalBookings].join(','));
  rows.push(['Exporté le', format(now, 'dd/MM/yyyy HH:mm')].join(','));

  const csv = rows.join('\n');
  const filename = `dog-universe-analytics-${format(now, 'yyyy-MM')}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
