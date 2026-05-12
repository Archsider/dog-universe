// Server async component — streams in via <Suspense> on the dashboard.
// Top 5 clients by revenue. Independent of the KPI block.
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { formatMAD } from '@/lib/utils';
import { safeClientWhere } from '@/lib/queries/safe-where';

interface Props {
  locale: string;
  labels: {
    top5: string;
    viewAll: string;
  };
}

export default async function DashboardLowerSections({ locale, labels }: Props) {
  const top5Revenue = await prisma.invoice.groupBy({
    by: ['clientId'],
    where: {
      status: { in: ['PAID', 'PARTIALLY_PAID'] },
      // RGPD : exclure ADMIN/SUPERADMIN + soft-deleted du Top 5.
      client: safeClientWhere,
    },
    _sum: { paidAmount: true },
    orderBy: { _sum: { paidAmount: 'desc' } },
    take: 5,
  });

  if (top5Revenue.length === 0) return null;

  const top5Users = await prisma.user.findMany({
    where: { id: { in: top5Revenue.map((r) => r.clientId) }, ...safeClientWhere },
    select: { id: true, name: true, email: true },
  });

  const userMap = new Map(top5Users.map((u) => [u.id, u]));
  const topClients = top5Revenue.map((r) => {
    const user = userMap.get(r.clientId);
    return {
      id: r.clientId,
      name: user?.name ?? r.clientId,
      email: user?.email ?? '',
      totalRevenue: Number(r._sum.paidAmount ?? 0),
    };
  });

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-charcoal">{labels.top5}</h2>
        <Link href={`/${locale}/admin/clients`} className="text-xs text-gold-600 hover:underline">{labels.viewAll}</Link>
      </div>
      <div className="space-y-3">
        {topClients.map((client, i) => (
          <Link key={client.id} href={`/${locale}/admin/clients/${client.id}`}>
            <div className="flex items-center gap-3 py-2 hover:bg-ivory-50 -mx-2 px-2 rounded transition-colors">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: ['#C9A84C', '#9CA3AF', '#CD7F32', '#E5E7EB', '#E5E7EB'][i], color: i < 3 ? '#fff' : '#374151' }}
              >
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-charcoal truncate">{client.name}</p>
                <p className="text-xs text-gray-400 truncate">{client.email}</p>
              </div>
              <span className="text-sm font-semibold text-gold-700 flex-shrink-0">{formatMAD(client.totalRevenue)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
