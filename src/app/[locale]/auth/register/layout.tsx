// Server-component layout — same pattern as auth/login/layout.tsx.
// Lives next to the client `page.tsx` solely to expose `generateMetadata`
// (title / description / hreflang / canonical) which a client component
// cannot export directly.
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
    ? 'إنشاء حساب — Dog Universe'
    : isFr
      ? 'Créer un compte — Dog Universe'
      : 'Create an account — Dog Universe';
  const description = isAr
    ? 'أنشئ حسابك في Dog Universe واحجز إقامة، نقل، وعناية لحيوانك الأليف في مراكش.'
    : isFr
      ? 'Créez votre compte Dog Universe pour réserver pension, transport et toilettage à Marrakech.'
      : 'Create your Dog Universe account to book boarding, transport and grooming in Marrakech.';

  return {
    title,
    description,
    alternates: {
      canonical: `${baseUrl}/${locale}/auth/register`,
      languages: {
        fr: `${baseUrl}/fr/auth/register`,
        en: `${baseUrl}/en/auth/register`,
        ar: `${baseUrl}/ar/auth/register`,
        'x-default': `${baseUrl}/fr/auth/register`,
      },
    },
  };
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
