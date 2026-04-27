import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Users, ChevronRight, Search, Wine } from 'lucide-react';
import { formatMAD, getInitials } from '@/lib/utils';
import CreateClientModal from './CreateClientModal';

const TIER_STYLES: Record<string, { bg: string; text: string }> = {
  BRONZE:   { bg: '#E8D4B8', text: '#7A4A28' },
  SILVER:   { bg: '#EBEBEF', text: '#5A5A70' },
  GOLD:     { bg: '#FBF3D0', text: '#8A6800' },
  PLATINUM: { bg: '#E8E8F4', text: '#3A3A5A' },
};

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; grade?: string; page?: string }>;
}

export default async function AdminClientsPage(props: PageProps) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) redirect(`/${locale}/auth/login`);

  const q = searchParams.q || '';
  const gradeFilter = searchParams.grade || '';
  const page = parseInt(searchParams.page || '1');
  const limit = 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    role: 'CLIENT',
    isWalkIn: false,
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

  const isFr = locale === 'fr';
  const detailsLabel = isFr ? 'Détails' : 'Details';
  const subtitle = isFr
    ? 'Liste de vos clients et de leurs séjours passés'
    : 'List of your clients and their past stays';
  const totalLabel = isFr ? 'clients au total' : 'clients total';

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-bold text-[#2A2520]">{l.title}</h1>
          <p className="text-sm text-[#8A7E75] mt-1">{subtitle}</p>
        </div>
        <CreateClientModal locale={locale} />
      </div>

      {/* Search + Filter pills */}
      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <form className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A7E75] pointer-events-none" />
          <input
            name="q"
            defaultValue={q}
            placeholder={l.search}
            className="w-full pl-10 pr-4 py-3 bg-white border border-[#C4974A] rounded-lg text-sm text-[#2A2520] placeholder:text-[#8A7E75] focus:outline-none focus:border-[#C4974A] focus:ring-2 focus:ring-[#C4974A]/20 transition-all duration-300"
          />
          <input type="hidden" name="grade" value={gradeFilter} />
        </form>
        <div className="flex gap-2 flex-wrap">
          {['', ...grades].map(g => {
            const active = gradeFilter === g;
            return (
              <Link key={g || 'all'} href={`?grade=${g}&q=${q}`}>
                <button
                  type="button"
                  className={`px-5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-300 ${
                    active
                      ? 'bg-[#C4974A] text-white border-2 border-[#C4974A] shadow-sm'
                      : 'bg-white text-[#8A7E75] border border-[#C4974A] hover:bg-[#C4974A]/5 hover:text-[#C4974A]'
                  }`}
                >
                  {g || l.all}
                </button>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Empty state */}
      {filteredClients.length === 0 ? (
        <div className="bg-white rounded-xl border border-[rgba(196,151,74,0.12)] shadow-[0_1px_3px_rgba(42,37,32,0.04)] text-center py-16 text-[#8A7E75]">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{l.noClients}</p>
        </div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="md:hidden space-y-4">
            {filteredClients.map(client => {
              const totalRevenue = client.invoices.reduce((sum, inv) => sum + inv.amount, 0);
              const grade = (client.loyaltyGrade?.grade || 'BRONZE') as keyof typeof TIER_STYLES;
              const tier = TIER_STYLES[grade];
              const gradeDisplay = grade.charAt(0) + grade.slice(1).toLowerCase();
              return (
                <div
                  key={client.id}
                  className="bg-white border border-[#C4974A] rounded-xl p-6 shadow-md shadow-[#C4974A]/10 hover:shadow-lg hover:shadow-[#C4974A]/20 hover:border-[#C4974A]/80 transition-all duration-300"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div
                      className="w-12 h-12 rounded-full border-[1.5px] border-[#C4974A] flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{ backgroundColor: tier.bg, color: tier.text }}
                    >
                      {getInitials(client.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[#2A2520] truncate">{client.name}</div>
                      <div className="text-sm text-[#8A7E75] truncate">{client.email}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 py-4 border-t border-b border-[rgba(196,151,74,0.12)] mb-4">
                    <div>
                      <div className="text-[10px] text-[#8A7E75] uppercase tracking-wider font-semibold">{l.pets}</div>
                      <div className="text-lg font-bold text-[#2A2520] mt-1">{client._count.pets}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#8A7E75] uppercase tracking-wider font-semibold">{l.stays}</div>
                      <div className="text-lg font-bold text-[#2A2520] mt-1">{client._count.bookings}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[10px] text-[#8A7E75] uppercase tracking-wider font-semibold">{l.revenue}</div>
                      <div className="text-lg font-bold text-[#C4974A] mt-1">{formatMAD(totalRevenue)}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border border-[#C4974A]/50"
                      style={{ backgroundColor: tier.bg, color: tier.text }}
                    >
                      <Wine className="h-3 w-3" />
                      {gradeDisplay}
                    </span>
                  </div>

                  <Link
                    href={`/${locale}/admin/clients/${client.id}`}
                    className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-[#C4974A] border border-[#C4974A] hover:bg-[#C4974A] hover:text-white transition-all duration-300"
                  >
                    {detailsLabel}
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              );
            })}
            <div className="text-center text-xs text-[#8A7E75] pt-2">
              {total} {totalLabel}
            </div>
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block bg-white rounded-xl border border-[rgba(196,151,74,0.12)] overflow-hidden shadow-[0_1px_3px_rgba(42,37,32,0.04)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="bg-[#FEFCF9] border-b border-[rgba(196,151,74,0.12)]">
                    <th className="text-left text-[11px] font-semibold text-[#8A7E75] px-6 py-4 uppercase tracking-wider">{l.name}</th>
                    <th className="text-left text-[11px] font-semibold text-[#8A7E75] px-6 py-4 uppercase tracking-wider">{l.email}</th>
                    <th className="text-left text-[11px] font-semibold text-[#8A7E75] px-6 py-4 uppercase tracking-wider">{l.pets}</th>
                    <th className="text-left text-[11px] font-semibold text-[#8A7E75] px-6 py-4 uppercase tracking-wider">{l.stays}</th>
                    <th className="text-left text-[11px] font-semibold text-[#8A7E75] px-6 py-4 uppercase tracking-wider">{l.revenue}</th>
                    <th className="text-left text-[11px] font-semibold text-[#8A7E75] px-6 py-4 uppercase tracking-wider">{l.grade}</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map(client => {
                    const totalRevenue = client.invoices.reduce((sum, inv) => sum + inv.amount, 0);
                    const grade = (client.loyaltyGrade?.grade || 'BRONZE') as keyof typeof TIER_STYLES;
                    const tier = TIER_STYLES[grade];
                    const gradeDisplay = grade.charAt(0) + grade.slice(1).toLowerCase();
                    return (
                      <tr
                        key={client.id}
                        className="border-b border-[rgba(196,151,74,0.08)] last:border-0 transition-all duration-300 hover:shadow-[inset_3px_0_0_#C4974A]"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-9 h-9 rounded-full border-[1.5px] border-[#C4974A] flex items-center justify-center text-xs font-bold flex-shrink-0"
                              style={{ backgroundColor: tier.bg, color: tier.text }}
                            >
                              {getInitials(client.name)}
                            </div>
                            <span className="text-sm font-semibold text-[#2A2520]">{client.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-[#8A7E75]">{client.email}</td>
                        <td className="px-6 py-4 text-sm text-[#2A2520]">{client._count.pets}</td>
                        <td className="px-6 py-4 text-sm text-[#2A2520]">{client._count.bookings}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-[#2A2520]">{formatMAD(totalRevenue)}</td>
                        <td className="px-6 py-4">
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border border-[#C4974A]/50"
                            style={{ backgroundColor: tier.bg, color: tier.text }}
                          >
                            <Wine className="h-3 w-3" />
                            {gradeDisplay}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            href={`/${locale}/admin/clients/${client.id}`}
                            className="inline-flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-semibold text-[#C4974A] border border-[#C4974A] hover:bg-[#C4974A] hover:text-white transition-all duration-300"
                          >
                            {detailsLabel}
                            <ChevronRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-[rgba(196,151,74,0.12)] text-xs text-[#8A7E75]">
              {total} {totalLabel}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
