import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import ClaimsManager from './ClaimsManager';
import { Gift } from 'lucide-react';

type Params = { locale: string };

export default async function AdminLoyaltyPage({ params }: { params: Promise<Params> }) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    redirect(`/${locale}/auth/login`);
  }

  const fr = locale === 'fr';

  const claims = await prisma.loyaltyBenefitClaim.findMany({
    include: {
      client: { select: { id: true, name: true, email: true } },
      reviewer: { select: { name: true } },
    },
    orderBy: { claimedAt: 'desc' },
  });

  const pendingCount = claims.filter((c) => c.status === 'PENDING').length;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-gold-100 flex items-center justify-center">
          <Gift className="h-5 w-5 text-gold-600" />
        </div>
        <div>
          <h1 className="text-xl font-serif font-bold text-charcoal">
            {fr ? 'Réclamations d\'avantages' : 'Benefit Claims'}
          </h1>
          <p className="text-sm text-charcoal/50">
            {pendingCount > 0
              ? (fr ? `${pendingCount} réclamation${pendingCount > 1 ? 's' : ''} en attente` : `${pendingCount} pending claim${pendingCount > 1 ? 's' : ''}`)
              : (fr ? 'Aucune réclamation en attente' : 'No pending claims')}
          </p>
        </div>
      </div>

      <ClaimsManager
        initialClaims={claims.map((c) => ({
          ...c,
          claimedAt: c.claimedAt.toISOString(),
          reviewedAt: c.reviewedAt?.toISOString() ?? null,
        }))}
        locale={locale}
      />
    </div>
  );
}
