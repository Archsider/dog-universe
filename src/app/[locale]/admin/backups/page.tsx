import { redirect } from 'next/navigation';
import { auth } from '../../../../../auth';
import BackupsClient from './BackupsClient';

export const dynamic = 'force-dynamic';

export default async function BackupsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();
  if (session?.user?.role !== 'SUPERADMIN') {
    redirect(`/${locale}/admin/dashboard`);
  }
  return <BackupsClient locale={locale} />;
}
