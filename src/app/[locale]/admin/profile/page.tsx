import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import AdminProfileClient from './AdminProfileClient';

type Props = { params: Promise<{ locale: string }> };

export default async function AdminProfilePage({ params }: Props) {
  const { locale } = await params;
  const session = await auth();

  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, phone: true },
  });

  if (!user) return null;

  return <AdminProfileClient initialProfile={user} locale={locale} />;
}
