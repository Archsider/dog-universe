// Public page reached via the email link sent when the admin proposes a
// time. No auth required — the HMAC token in the URL is the auth.
//
// Renders read-only proposal context + Accept / Reject buttons. On
// success, shows a "thank you" confirmation. On expired/resolved token,
// shows a graceful message + WhatsApp fallback.
//
// Source : architecture proposal classe mondiale 2026-05-17.

import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { verifyTimeProposalToken } from '@/lib/time-proposals';
import { PublicProposalClient } from './PublicProposalClient';

interface PageProps {
  params: Promise<{ locale: string; token: string }>;
}

const SCOPE_LABEL: Record<string, { fr: string; en: string }> = {
  ARRIVAL:     { fr: "l'arrivée à la pension", en: 'arrival at the pension' },
  TAXI_GO:     { fr: 'le taxi aller', en: 'taxi outbound' },
  TAXI_RETURN: { fr: 'le taxi retour', en: 'taxi return' },
};

export default async function TimeProposalPublicPage({ params }: PageProps) {
  const { locale, token } = await params;
  const fr = locale === 'fr';

  const proposalId = verifyTimeProposalToken(token);
  if (!proposalId) {
    return (
      <main className="min-h-screen bg-ivory-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-card p-6 text-center">
          <p className="text-5xl mb-3" aria-hidden="true">🔒</p>
          <h1 className="text-xl font-bold text-charcoal mb-2">
            {fr ? 'Lien invalide' : 'Invalid link'}
          </h1>
          <p className="text-sm text-gray-600">
            {fr
              ? "Ce lien n'est pas valide ou a expiré. Contactez Dog Universe."
              : 'This link is invalid or has expired. Please contact Dog Universe.'}
          </p>
        </div>
      </main>
    );
  }

  const proposal = await prisma.timeProposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      bookingId: true,
      scope: true,
      time: true,
      status: true,
      proposalNote: true,
      publicTokenExpiresAt: true,
      booking: {
        select: {
          startDate: true,
          endDate: true,
          client: { select: { name: true, phone: true } },
          bookingPets: { select: { pet: { select: { name: true } } } },
        },
      },
    },
  });

  if (!proposal) notFound();

  const label = SCOPE_LABEL[proposal.scope];
  const petName = proposal.booking.bookingPets[0]?.pet.name ?? '';
  const expired = proposal.publicTokenExpiresAt && proposal.publicTokenExpiresAt < new Date();
  const resolved = proposal.status !== 'PENDING';

  if (expired || resolved) {
    return (
      <main className="min-h-screen bg-ivory-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-card p-6 text-center">
          <p className="text-5xl mb-3" aria-hidden="true">{resolved ? '✓' : '⏳'}</p>
          <h1 className="text-xl font-bold text-charcoal mb-2">
            {resolved
              ? (fr ? 'Cette proposition est déjà traitée' : 'This proposal is already resolved')
              : (fr ? 'Ce lien a expiré' : 'This link has expired')}
          </h1>
          <p className="text-sm text-gray-600 mb-4">
            {fr
              ? `Statut : ${proposal.status}. Pour toute question, contactez-nous via WhatsApp.`
              : `Status: ${proposal.status}. For any question, reach us via WhatsApp.`}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ivory-50 flex items-center justify-center p-6">
      <PublicProposalClient
        locale={locale}
        token={token}
        proposal={{
          time: proposal.time,
          scopeLabel: fr ? label.fr : label.en,
          petName,
          proposalNote: proposal.proposalNote,
        }}
      />
    </main>
  );
}
