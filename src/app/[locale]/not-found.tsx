import { headers } from 'next/headers';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function NotFound() {
  const h = await headers();
  const locale = h.get('x-locale') ?? 'fr';
  const isFr = locale === 'fr';

  return (
    <div className="min-h-screen bg-[#FAF6F0] flex flex-col">
      <header className="bg-white border-b border-[#F0D98A]/30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center">
          <Link href={`/${locale}`}>
            <Image
              src="/logo.png"
              alt="Dog Universe"
              width={140}
              height={38}
              className="h-9 w-auto object-contain"
              priority
            />
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-20">
        <div className="text-center max-w-md">
          <p className="text-7xl font-serif font-bold text-[#F0D98A] mb-6 select-none">404</p>
          <h1 className="text-2xl font-serif font-bold text-charcoal mb-3">
            {isFr ? 'Page introuvable' : 'Page not found'}
          </h1>
          <p className="text-neutral-600 mb-10 leading-relaxed">
            {isFr
              ? "La page que vous recherchez n'existe pas ou a été déplacée."
              : 'The page you are looking for does not exist or has been moved.'}
          </p>
          <Link
            href={`/${locale}`}
            className="inline-block bg-gold-500 hover:bg-gold-600 text-stone-900 font-semibold px-6 py-3.5 rounded-lg transition-colors shadow-sm"
          >
            {isFr ? '← Retour à l\'accueil' : '← Back to home'}
          </Link>
        </div>
      </main>

      <footer className="border-t border-[#F0D98A]/30">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-neutral-500">
          <span>© {new Date().getFullYear()} Dog Universe — Marrakech</span>
          <div className="flex items-center gap-4">
            <Link href={`/${locale}/privacy`} className="hover:text-charcoal transition-colors">
              {isFr ? 'Confidentialité' : 'Privacy'}
            </Link>
            <Link href={`/${locale}/terms`} className="hover:text-charcoal transition-colors">
              {isFr ? 'CGU' : 'Terms'}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
