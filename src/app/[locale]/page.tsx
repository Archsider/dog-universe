import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '../../../auth';
import LandingPage from '@/components/landing/LandingPage';

type Params = { locale: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://doguniverse.ma';
  const isFr = locale === 'fr';

  const title = isFr
    ? 'Dog Universe — Pension & Pet Taxi à Marrakech'
    : 'Dog Universe — Pet Boarding & Taxi in Marrakech';
  const description = isFr
    ? 'Pension haut de gamme pour chiens et chats, pet taxi et toilettage à Marrakech. Réservation en ligne, suivi en temps réel.'
    : 'Premium dog and cat boarding, pet taxi and grooming in Marrakech. Book online and track your pet in real time.';

  return {
    title,
    description,
    alternates: {
      canonical: `${baseUrl}/${locale}`,
      languages: {
        fr: `${baseUrl}/fr`,
        en: `${baseUrl}/en`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${baseUrl}/${locale}`,
      siteName: 'Dog Universe',
      locale: isFr ? 'fr_MA' : 'en_US',
      type: 'website',
      images: [
        {
          url: `${baseUrl}/logo.png`,
          width: 512,
          height: 140,
          alt: 'Dog Universe',
        },
      ],
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default async function Home({ params }: { params: Promise<Params> }) {
  const { locale } = await params;
  const session = await auth();

  if (session?.user) {
    if (session.user.role === 'ADMIN' || session.user.role === 'SUPERADMIN') {
      redirect(`/${locale}/admin/dashboard`);
    } else {
      redirect(`/${locale}/client/dashboard`);
    }
  }

  return <LandingPage locale={locale} />;
}
