import Link from 'next/link';

// Fallback for paths outside any locale segment (e.g. /random-path).
// Defaults to French since it is the primary locale.
export default function NotFound() {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#FEFCF9] px-6 py-12 overflow-hidden">
      {/* Zellige pattern fond — opacité 6% */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.06]"
        aria-hidden="true"
      >
        <defs>
          <pattern id="zellige-404" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
            <path
              d="M40 0 L80 40 L40 80 L0 40 Z M40 16 L64 40 L40 64 L16 40 Z"
              fill="none"
              stroke="#C4974A"
              strokeWidth="1.2"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#zellige-404)" />
      </svg>

      <div className="relative z-10 text-center max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/mascotte-assise.webp"
          alt=""
          aria-hidden="true"
          className="h-48 w-auto mx-auto mb-6 object-contain"
        />
        <p className="font-serif text-6xl font-bold text-[#C4974A] leading-none mb-4">404</p>
        <p className="text-[#7A6E65] text-base leading-relaxed mb-8">
          Cette page s&apos;est perdue en chemin…
        </p>
        <Link
          href="/fr"
          className="inline-block px-6 py-3 rounded-lg border border-[#C4974A] text-[#C4974A] font-medium hover:bg-[#C4974A] hover:text-white transition-all duration-200"
        >
          ← Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
