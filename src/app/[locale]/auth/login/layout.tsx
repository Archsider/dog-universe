// Server-component layout — exists solely to attach metadata to the
// login route. The page itself is a client component (`'use client'` for
// signIn / state) and can't export `generateMetadata`. The layout sits
// between it and the locale layout, so the metadata cascades correctly.
import type { Metadata } from 'next';

type Params = { locale: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.doguniverse.ma';
  const isFr = locale === 'fr';
  const isAr = locale === 'ar';

  const title = isAr
    ? 'تسجيل الدخول — Dog Universe'
    : isFr
      ? 'Connexion — Dog Universe'
      : 'Sign in — Dog Universe';
  const description = isAr
    ? 'سجّل الدخول إلى حسابك Dog Universe في مراكش.'
    : isFr
      ? 'Connectez-vous à votre espace Dog Universe à Marrakech.'
      : 'Sign in to your Dog Universe account in Marrakech.';

  return {
    title,
    description,
    alternates: {
      canonical: `${baseUrl}/${locale}/auth/login`,
      languages: {
        fr: `${baseUrl}/fr/auth/login`,
        en: `${baseUrl}/en/auth/login`,
        ar: `${baseUrl}/ar/auth/login`,
        'x-default': `${baseUrl}/fr/auth/login`,
      },
    },
  };
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
