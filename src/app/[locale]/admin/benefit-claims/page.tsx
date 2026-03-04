import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { BenefitClaimActions } from './BenefitClaimActions';
import { Gift } from 'lucide-react';

interface PageProps {
  params: { locale: string };
  searchParams: { status?: string };
}

const BENEFIT_LABELS: Record<string, { fr: string; en: string }> = {
  VET_CHECKUP:       { fr: 'Check-up vétérinaire',     en: 'Vet check-up' },
  PET_TRANSPORT:     { fr: 'Transport animalier',       en: 'Pet transport' },
  BIRTHDAY_SURPRISE: { fr: 'Surprise anniversaire',     en: 'Birthday surprise' },
};

export default async function AdminBenefitClaimsPage({ params: { locale }, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect(`/${locale}/auth/login`);

  const isFr = locale !== 'en';
  const statusFilter = searchParams.status || 'PENDING';

  const claims = await prisma.benefitClaim.findMany({
    where: statusFilter === 'ALL' ? {} : { status: statusFilter },
    include: {
      client: { select: { id: true, name: true, email: true, loyaltyGrade: { select: { grade: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const statusFilters = [
    ['PENDING',  isFr ? 'En attente' : 'Pending'],
    ['APPROVED', isFr ? 'Approuvées' : 'Approved'],
    ['REJECTED', isFr ? 'Refusées'   : 'Rejected'],
    ['ALL',      isFr ? 'Toutes'     : 'All'],
  ];

  const statusBadge: Record<string, string> = {
    PENDING:  'bg-amber-50 text-amber-700 border-amber-200',
    APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    REJECTED: 'bg-red-50 text-red-700 border-red-200',
  };

  const statusLabel: Record<string, string> = isFr
    ? { PENDING: 'En attente', APPROVED: 'Approuvée', REJECTED: 'Refusée' }
    : { PENDING: 'Pending',    APPROVED: 'Approved',  REJECTED: 'Rejected' };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-charcoal flex items-center gap-2">
          <Gift className="h-5 w-5 text-gold-500" />
          {isFr ? 'Demandes d\'avantages fidélité' : 'Loyalty benefit requests'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {isFr ? 'Gérez les demandes de vos clients pour activer leurs avantages.' : 'Manage client requests to activate their loyalty benefits.'}
        </p>
      </div>

      {/* Status filters */}
      <div className="flex flex-wrap gap-2">
        {statusFilters.map(([value, label]) => (
          <Link
            key={value}
            href={`/${locale}/admin/benefit-claims?status=${value}`}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              statusFilter === value
                ? 'bg-charcoal text-white border-charcoal'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gold-300'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card overflow-hidden">
        {claims.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">
            {isFr ? 'Aucune demande.' : 'No requests.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ivory-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{isFr ? 'Client' : 'Client'}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{isFr ? 'Avantage' : 'Benefit'}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{isFr ? 'Note client' : 'Client note'}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{isFr ? 'Date' : 'Date'}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{isFr ? 'Statut' : 'Status'}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{isFr ? 'Actions' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {claims.map((claim) => {
                  const benefitLabel = BENEFIT_LABELS[claim.benefitKey];
                  return (
                    <tr key={claim.id} className="hover:bg-ivory-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/${locale}/admin/clients/${claim.client.id}`} className="font-medium text-charcoal hover:text-gold-600 transition-colors">
                          {claim.client.name}
                        </Link>
                        <p className="text-xs text-gray-400">{claim.client.email}</p>
                        {claim.client.loyaltyGrade && (
                          <span className="text-xs text-gold-600 font-medium">{claim.client.loyaltyGrade.grade}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-charcoal">
                        {isFr ? benefitLabel?.fr : benefitLabel?.en ?? claim.benefitKey}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-32">
                        {claim.note || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(claim.createdAt).toLocaleDateString(isFr ? 'fr-FR' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${statusBadge[claim.status] ?? ''}`}>
                          {statusLabel[claim.status] ?? claim.status}
                        </span>
                        {claim.adminNote && (
                          <p className="text-xs text-gray-400 mt-0.5 italic">{claim.adminNote}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {claim.status === 'PENDING' ? (
                          <BenefitClaimActions claimId={claim.id} locale={locale} />
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
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
