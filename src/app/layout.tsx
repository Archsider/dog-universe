import type { Metadata } from 'next';
import { Playfair_Display, Inter } from 'next/font/google';
import { headers } from 'next/headers';
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

export const metadata: Metadata = {
  title: 'Dog Universe',
  description: 'Pension haut de gamme et transport pour animaux à Marrakech',
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
    <html lang={lang} suppressHydrationWarning nonce={nonce} className={`${playfair.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
