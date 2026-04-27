import Link from 'next/link';

// Fallback for paths outside any locale segment (e.g. /random-path).
// Server Component — no 'use client' required.
export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FEFCF9] flex flex-col items-center justify-center text-center px-4">
      <video
        src="/images/mascotte.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="h-48 w-auto object-contain drop-shadow-lg mx-auto mb-6"
      />
      <h1 className="font-serif text-8xl font-bold text-[#C4974A] mb-2">404</h1>
      <p className="text-[#7A6E65] text-lg mb-8">
        Cette page s&apos;est perdue en chemin…
      </p>
      <Link
        href="/"
        className="px-6 py-3 border-2 border-[#C4974A] text-[#C4974A] rounded-xl font-medium hover:bg-[#C4974A] hover:text-white transition-all duration-200"
      >
        ← Retour à l&apos;accueil
      </Link>
    </div>
  );
}
