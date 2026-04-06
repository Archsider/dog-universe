import Link from 'next/link';
import Image from 'next/image';

// Fallback for paths outside any locale segment (e.g. /random-path).
// Defaults to French since it is the primary locale.
export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FAF6F0] flex flex-col">
      <header className="bg-white border-b border-[#F0D98A]/30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center">
          <Link href="/fr">
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
          <h1 className="text-2xl font-serif font-bold text-[#1a1a2e] mb-3">
            Page introuvable
          </h1>
          <p className="text-neutral-600 mb-10 leading-relaxed">
            La page que vous recherchez n&apos;existe pas ou a été déplacée.
          </p>
          <Link
            href="/fr"
            className="inline-block bg-[#F0D98A] hover:bg-[#e8ce72] text-stone-900 font-semibold px-6 py-3.5 rounded-lg transition-colors shadow-sm"
          >
            ← Retour à l&apos;accueil
          </Link>
        </div>
      </main>

      <footer className="border-t border-[#F0D98A]/30">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-sm text-neutral-500">
          © {new Date().getFullYear()} Dog Universe — Marrakech
        </div>
      </footer>
    </div>
  );
}
