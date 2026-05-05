import type { Metadata } from 'next';
import { Playfair_Display, Inter, Noto_Sans_Arabic } from 'next/font/google';
import { headers } from 'next/headers';
import { PWAInstaller } from '@/components/shared/PWAInstaller';
import './globals.css';

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-playfair',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const notoArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-noto-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Dog Universe',
  description: 'Pension haut de gamme et transport pour animaux à Marrakech',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Dog Universe',
  },
  icons: {
    apple: '/icons/icon-192.png',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const nonce = h.get('x-nonce') ?? undefined;
  const lang = h.get('x-locale') ?? 'fr';

  return (
    <html lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'} suppressHydrationWarning nonce={nonce} className={`${playfair.variable} ${inter.variable} ${notoArabic.variable}`}>
      <body className={lang === 'ar' ? 'font-arabic' : ''}>
        <PWAInstaller />
        {children}
      </body>
    </html>
  );
}
