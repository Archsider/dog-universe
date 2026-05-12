import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { createSignedUrl } from '@/lib/supabase';
import ProfileClient from './ProfileClient';

interface PageProps { params: Promise<{ locale: string }> }

export default async function ProfilePage({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/${locale}/auth/login`);

  const [user, contract] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, firstName: true, lastName: true, email: true, phone: true },
    }),
    prisma.clientContract.findUnique({
      where: { clientId: session.user.id },
      select: { id: true, signedAt: true, storageKey: true, version: true },
    }),
  ]);

  if (!user) redirect(`/${locale}/auth/login`);

  let contractInfo = null;
  if (contract) {
    const ttlSeconds = 900;
    let downloadUrl: string | null = null;
    let expiresAt: string | null = null;
    if (contract.storageKey) {
      try {
        downloadUrl = await createSignedUrl(contract.storageKey, ttlSeconds);
        expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      } catch {
        // Fail gracefully — client will refresh on demand
      }
    }
    contractInfo = {
      id: contract.id,
      signedAt: contract.signedAt.toISOString(),
      downloadUrl,
      expiresAt,
      version: contract.version,
    };
  }

  return (
    <ProfileClient
      initialProfile={{
        id: user.id,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
      }}
      initialContract={contractInfo}
      locale={locale}
    />
  );
}
