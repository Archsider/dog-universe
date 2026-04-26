import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { createSignedUrl } from '@/lib/supabase';
import { FileText, CheckCircle2, XCircle } from 'lucide-react';
import ContractsManager from './ContractsManager';

interface PageProps { params: Promise<{ locale: string }> }

export default async function AdminContractsPage({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    redirect(`/${locale}/auth/login`);
  }

  const rawClients = await prisma.user.findMany({
    where: { role: 'CLIENT' },
    include: {
      contract: { select: { id: true, signedAt: true, storageKey: true, version: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Generate short-lived signed URLs for each contract (1 hour)
  const clients = await Promise.all(
    rawClients.map(async (c) => ({
      ...c,
      contract: c.contract
        ? {
            ...c.contract,
            downloadUrl: await createSignedUrl(c.contract.storageKey).catch(() => null),
          }
        : null,
    }))
  );

  const signed = clients.filter(c => c.contract !== null);
  const unsigned = clients.filter(c => c.contract === null);
  const signedRate = clients.length > 0 ? Math.round((signed.length / clients.length) * 100) : 0;

  const isFr = locale === 'fr';
  const l = {
    title: isFr ? 'Contrats clients' : 'Client Contracts',
    subtitle: isFr ? 'Suivi de la signature des contrats d\'hébergement' : 'Track boarding contract signatures',
    statSigned: isFr ? 'Contrats signés' : 'Signed contracts',
    statUnsigned: isFr ? 'Non signés' : 'Unsigned',
    statRate: isFr ? 'Taux de signature' : 'Signature rate',
    noClients: isFr ? 'Aucun client' : 'No clients',
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

      {clients.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card text-center py-12 text-gray-400">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>{l.noClients}</p>
        </div>
      ) : (
        <ContractsManager
          clients={clients.map(c => ({
            id: c.id,
            name: c.name,
            email: c.email,
            contract: c.contract
              ? { id: c.contract.id, signedAt: c.contract.signedAt, downloadUrl: c.contract.downloadUrl, version: c.contract.version }
              : null,
          }))}
          locale={locale}
        />
      )}
    </div>
  );
}
