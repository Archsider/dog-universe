import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { AdminsClient } from './AdminsClient';

export default async function AdminsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();

  if (!session?.user || session.user.role !== 'SUPERADMIN') {
    redirect(`/${locale}/admin/dashboard`);
  }

  return <AdminsClient currentUserId={session.user.id} />;
}
