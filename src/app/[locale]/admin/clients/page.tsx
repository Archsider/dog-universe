import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Users, ChevronRight } from 'lucide-react';
import { formatMAD, getInitials } from '@/lib/utils';
import { LoyaltyBadge } from '@/components/shared/LoyaltyBadge';

interface PageProps {
  params: { locale: string };
  searchParams: { q?: string; grade?: string; page?: string };
}

export default async function AdminClientsPage({ params: { locale }, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect(`/${locale}/auth/login`);

  const q = searchParams.q || '';
  const gradeFilter = searchParams.grade || '';
  const page = parseInt(searchParams.page || '1');
  const limit = 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    role: 'CLIENT',
    ...(q && { OR: [{ name: { contains: q } }, { email: { contains: q } }] }),
  };

  const [clients, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        loyaltyGrade: true,
        _count: { select: { pets: true, bookings: true } },
        invoices: { where: { status: 'PAID' }, select: { amount: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  const filteredClients = gradeFilter ? clients.filter(c => c.loyaltyGrade?.grade === gradeFilter) : clients;

  const labels = {
    fr: { title: 'Clients', search: 'Rechercher...', all: 'Tous', name: 'Nom', email: 'Email', pets: 'Animaux', stays: 'Séjours', revenue: 'Revenu', grade: 'Grade', noClients: 'Aucun client', clients: 'clients' },
    en: { title: 'Clients', search: 'Search...', all: 'All', name: 'Name', email: 'Email', pets: 'Pets', stays: 'Stays', revenue: 'Revenue', grade: 'Grade', noClients: 'No clients', clients: 'clients' },
  };
  const l = labels[locale as keyof typeof labels] || labels.fr;
  const grades = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
        <span className="text-sm text-gray-500">{total} {l.clients}</span>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap">
        <form className="relative flex-1 min-w-[200px]">
          <input name="q" defaultValue={q} placeholder={l.search} className="w-full pl-4 pr-4 py-2 border border-ivory-200 rounded-lg text-sm focus:outline-none focus:border-gold-400 bg-white" />
          <input type="hidden" name="grade" value={gradeFilter} />
        </form>
        <div className="flex gap-2 flex-wrap">
          {['', ...grades].map(g => (
            <Link key={g || 'all'} href={`?grade=${g}&q=${q}`}>
              <button className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${gradeFilter === g ? 'bg-charcoal text-white' : 'bg-white border border-ivory-200 text-gray-600 hover:border-gold-300'}`}>{g || l.all}</button>
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card overflow-hidden">
        {filteredClients.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-30" /><p>{l.noClients}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ivory-200 bg-ivory-50">
                  {[l.name, l.email, l.pets, l.stays, l.revenue, l.grade, ''].map((h, i) => (
                    <th key={i} className={`text-left text-xs font-semibold text-gray-500 px-4 py-3 ${i === 2 || i === 3 ? 'text-center hidden sm:table-cell' : i === 4 ? 'text-right hidden lg:table-cell' : i === 5 ? 'text-center' : i === 1 ? 'hidden md:table-cell' : i === 6 ? 'w-8' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredClients.map(client => {
                  const totalRevenue = client.invoices.reduce((sum, inv) => sum + inv.amount, 0);
                  const grade = client.loyaltyGrade?.grade || 'BRONZE';
                  return (
                    <tr key={client.id} className="border-b border-ivory-100 last:border-0 hover:bg-ivory-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gold-100 flex items-center justify-center text-xs font-semibold text-gold-700 flex-shrink-0">{getInitials(client.name)}</div>
                          <span className="font-medium text-sm text-charcoal">{client.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{client.email}</td>
                      <td className="px-4 py-3 text-center text-sm text-charcoal hidden sm:table-cell">{client._count.pets}</td>
                      <td className="px-4 py-3 text-center text-sm text-charcoal hidden sm:table-cell">{client._count.bookings}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-charcoal hidden lg:table-cell">{formatMAD(totalRevenue)}</td>
                      <td className="px-4 py-3 text-center"><LoyaltyBadge grade={grade} locale={locale} size="sm" /></td>
                      <td className="px-4 py-3">
                        <Link href={`/${locale}/admin/clients/${client.id}`}><ChevronRight className="h-4 w-4 text-gray-400 hover:text-gold-500" /></Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
