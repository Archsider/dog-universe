import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { FileText, CheckCircle2, XCircle, Download, Eye } from 'lucide-react';
import { getInitials, formatDate } from '@/lib/utils';

interface PageProps { params: { locale: string } }

export default async function AdminContractsPage({ params: { locale } }: PageProps) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    redirect(`/${locale}/auth/login`);
  }

  const clients = await prisma.user.findMany({
    where: { role: 'CLIENT' },
    include: {
      contract: { select: { signedAt: true, pdfUrl: true, version: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const signed = clients.filter(c => c.contract !== null);
  const unsigned = clients.filter(c => c.contract === null);
  const signedRate = clients.length > 0 ? Math.round((signed.length / clients.length) * 100) : 0;

  const l = locale === 'fr' ? {
    title: 'Contrats clients',
    subtitle: 'Suivi de la signature des contrats d\'hébergement',
    statSigned: 'Contrats signés',
    statUnsigned: 'Non signés',
    statRate: 'Taux de signature',
    colClient: 'Client',
    colEmail: 'Email',
    colStatus: 'Statut',
    colDate: 'Date de signature',
    colVersion: 'Version',
    colAction: '',
    statusSigned: 'Signé',
    statusUnsigned: 'Non signé',
    download: 'Télécharger',
    filterAll: 'Tous',
    filterSigned: 'Signés',
    filterUnsigned: 'Non signés',
    noClients: 'Aucun client',
  } : {
    title: 'Client Contracts',
    subtitle: 'Track boarding contract signatures',
    statSigned: 'Signed contracts',
    statUnsigned: 'Unsigned',
    statRate: 'Signature rate',
    colClient: 'Client',
    colEmail: 'Email',
    colStatus: 'Status',
    colDate: 'Signed on',
    colVersion: 'Version',
    colAction: '',
    statusSigned: 'Signed',
    statusUnsigned: 'Unsigned',
    download: 'Download',
    filterAll: 'All',
    filterSigned: 'Signed',
    filterUnsigned: 'Unsigned',
    noClients: 'No clients',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
        <p className="text-sm text-gray-500 mt-1">{l.subtitle}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-charcoal">{signed.length}</div>
            <div className="text-xs text-gray-500">{l.statSigned}</div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <XCircle className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <div className="text-2xl font-bold text-charcoal">{unsigned.length}</div>
            <div className="text-xs text-gray-500">{l.statUnsigned}</div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gold-50 flex items-center justify-center flex-shrink-0">
            <FileText className="h-5 w-5 text-gold-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-charcoal">{signedRate}%</div>
            <div className="text-xs text-gray-500">{l.statRate}</div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-charcoal">{l.statRate}</span>
          <span className="text-sm text-gray-500">{signed.length} / {clients.length}</span>
        </div>
        <div className="w-full bg-ivory-100 rounded-full h-2.5">
          <div
            className="h-2.5 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 transition-all"
            style={{ width: `${signedRate}%` }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card overflow-hidden">
        {clients.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>{l.noClients}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ivory-200 bg-ivory-50">
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{l.colClient}</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">{l.colEmail}</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">{l.colStatus}</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden sm:table-cell">{l.colDate}</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">{l.colVersion}</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">{l.colAction}</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(client => (
                  <tr key={client.id} className="border-b border-ivory-100 last:border-0 hover:bg-ivory-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gold-100 flex items-center justify-center text-xs font-semibold text-gold-700 flex-shrink-0">
                          {getInitials(client.name)}
                        </div>
                        <span className="font-medium text-sm text-charcoal">{client.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{client.email}</td>
                    <td className="px-4 py-3 text-center">
                      {client.contract ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                          <CheckCircle2 className="h-3 w-3" />
                          {l.statusSigned}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-xs font-medium">
                          <XCircle className="h-3 w-3" />
                          {l.statusUnsigned}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">
                      {client.contract ? formatDate(client.contract.signedAt.toISOString()) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-500 hidden lg:table-cell">
                      {client.contract ? `v${client.contract.version}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {client.contract?.pdfUrl ? (
                        <div className="flex items-center justify-end gap-1">
                          <a
                            href={client.contract.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={locale === 'fr' ? 'Aperçu' : 'Preview'}
                            className="p-1.5 text-gray-400 hover:text-gold-600 rounded transition-colors"
                          >
                            <Eye className="h-4 w-4" />
                          </a>
                          <a
                            href={client.contract.pdfUrl}
                            download
                            title={l.download}
                            className="p-1.5 text-gray-400 hover:text-gold-600 rounded transition-colors"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
