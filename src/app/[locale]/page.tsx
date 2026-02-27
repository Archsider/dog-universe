import { redirect } from 'next/navigation';
import { auth } from '../../../auth';
import LandingPage from '@/components/landing/LandingPage';

type Params = { locale: string };

export default async function Home({ params }: { params: Promise<Params> }) {
  const { locale } = await params;
  const session = await auth();

  if (session?.user) {
    if (session.user.role === 'ADMIN') {
      redirect(`/${locale}/admin/dashboard`);
    } else {
      redirect(`/${locale}/client/dashboard`);
    }
  }

  return <LandingPage locale={locale} />;
}
