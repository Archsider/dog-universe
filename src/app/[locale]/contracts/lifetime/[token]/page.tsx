// Public page reached via the magic link sent to Stephanie.  HMAC token in
// the URL is the only auth.
//
// Renders the verbatim Lifetime Boarding Agreement and the signature pad.
// The on-screen contract text comes from `LIFETIME_ARTICLES` exported by
// the PDF generator — single source of truth, what she reads is what she
// signs.

import { prisma } from '@/lib/prisma';
import { verifyLifetimeToken } from '@/lib/lifetime-contracts';
import { LIFETIME_ARTICLES } from '@/lib/contract-pdf-lifetime-content';
import { LifetimeSignClient } from './LifetimeSignClient';

interface PageProps {
  params: Promise<{ locale: string; token: string }>;
}

function ErrorPage({ icon, title, message }: { icon: string; title: string; message: string }) {
  return (
    <main className="min-h-screen bg-ivory-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-card p-6 text-center border border-[#F0D98A]/40">
        <p className="text-5xl mb-3" aria-hidden="true">{icon}</p>
        <h1 className="text-xl font-bold text-charcoal mb-2">{title}</h1>
        <p className="text-sm text-gray-600">{message}</p>
      </div>
    </main>
  );
}

export default async function LifetimeContractSignPage({ params }: PageProps) {
  const { token } = await params;

  const contractId = verifyLifetimeToken(token);
  if (!contractId) {
    return (
      <ErrorPage
        icon="🔒"
        title="Invalid link"
        message="This link is not valid. If you received it from Dog Universe, please contact us."
      />
    );
  }

  const contract = await prisma.lifetimeContract.findUnique({
    where: { id: contractId },
    select: {
      publicToken: true,
      status: true,
      signedAt: true,
      publicTokenExpiresAt: true,
    },
  });

  if (!contract || contract.publicToken !== token) {
    return (
      <ErrorPage
        icon="❓"
        title="Agreement not found"
        message="This agreement does not exist or was cancelled by Dog Universe."
      />
    );
  }
  if (contract.status === 'REVOKED') {
    return (
      <ErrorPage
        icon="🚫"
        title="Link revoked"
        message="This link was cancelled by Dog Universe. Please contact us for a new link."
      />
    );
  }
  const expired =
    contract.status === 'EXPIRED' ||
    (contract.publicTokenExpiresAt && contract.publicTokenExpiresAt < new Date());

  if (expired) {
    return (
      <ErrorPage
        icon="⏳"
        title="Link expired"
        message="This link has expired. Please ask Dog Universe for a new one."
      />
    );
  }

  return (
    <main className="min-h-screen bg-ivory-50 py-8 px-4">
      <LifetimeSignClient
        token={token}
        alreadySigned={contract.status === 'SIGNED'}
        signedAt={contract.signedAt ? contract.signedAt.toISOString() : null}
        articles={LIFETIME_ARTICLES}
      />
    </main>
  );
}
