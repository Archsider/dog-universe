// /client/card — standalone full-screen Member Card.
//
// Designed to be the start_url of a PWA shortcut ("Add to Home Screen"
// turns this page into a single-tap launcher).  No nav, no clutter — just
// the card, the QR, and an iOS-detection banner that nudges the client
// towards installing the shortcut.
//
// Source : Feature #2 audit world (2026-05-19) — Apple Wallet card pivot
// to PWA shortcut.  Real Apple Wallet passes need an Apple Developer
// account ($99/yr) + pass type ID cert ; this gives 80 % of the value
// for 0 % of the cost.

import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { MemberCard } from '@/components/shared/MemberCard';
import { Grade } from '@/lib/loyalty';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import AddToHomeBanner from './AddToHomeBanner';

type Params = { locale: string };

export const metadata = {
  title: 'Ma carte de membre — Dog Universe',
  description: 'Votre carte de membre Dog Universe — QR code et avantages.',
};

export default async function ClientCardPage({ params }: { params: Promise<Params> }) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);

  const [pets, loyaltyGrade, myClaims, totalStays, totalSpent] = await Promise.all([
    prisma.pet.findMany({
      where: notDeleted({ ownerId: session.user.id }),
      select: { name: true, species: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.loyaltyGrade.findUnique({ where: { clientId: session.user.id } }),
    prisma.loyaltyBenefitClaim.findMany({
      where: { clientId: session.user.id },
      select: { benefitKey: true, status: true },
      orderBy: { claimedAt: 'desc' },
    }),
    prisma.booking.count({ where: notDeleted({ clientId: session.user.id, status: 'COMPLETED' }) }),
    prisma.invoice.aggregate({ where: { clientId: session.user.id, status: 'PAID' }, _sum: { amount: true } }),
  ]);

  const grade = (loyaltyGrade?.grade ?? 'BRONZE') as Grade;
  const fr = locale === 'fr';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#141428] via-[#0a0a1f] to-[#141428] py-6 px-4">
      <div className="max-w-md mx-auto">
        {/* Back link — small, discreet, only useful when not in standalone mode */}
        <Link
          href={`/${locale}/client/dashboard`}
          className="inline-flex items-center gap-1 text-sm text-[#D4AF37]/70 hover:text-[#D4AF37] mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          {fr ? 'Retour' : 'Back'}
        </Link>

        <div className="rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(212,175,55,0.18)] border border-[rgba(212,175,55,0.25)]">
          <MemberCard
            clientId={session.user.id}
            clientName={session.user.name ?? ''}
            pets={pets.map(p => ({ name: p.name, species: p.species }))}
            grade={grade}
            totalStays={totalStays}
            totalSpentMAD={Number(totalSpent._sum.amount ?? 0)}
            locale={locale}
            claims={myClaims as { benefitKey: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' }[]}
          />
        </div>

        <AddToHomeBanner locale={locale} />

        <p className="text-center text-xs text-[#D4AF37]/40 mt-6">
          {fr
            ? 'Présentez ce QR à l\'accueil pour un check-in instantané.'
            : 'Show this QR at reception for instant check-in.'}
        </p>
      </div>
    </div>
  );
}
