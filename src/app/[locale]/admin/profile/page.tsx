import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import AdminProfileClient from './AdminProfileClient';
import { TotpSetupSection } from './TotpSetupSection';

type Props = { params: Promise<{ locale: string }> };

export default async function AdminProfilePage({ params }: Props) {
  const { locale } = await params;
  const session = await auth();

  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, phone: true, totpEnabled: true },
  });

  if (!user) return null;

  return (
    <>
      <AdminProfileClient initialProfile={user} locale={locale} />
      <div className="max-w-2xl mx-auto mt-6">
        <TotpSetupSection totpEnabled={user.totpEnabled} />
      </div>
    </>
  );
}
