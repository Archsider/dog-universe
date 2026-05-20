// Public landing for a referral magic link.  No locale prefix.
//
// On invalid / expired-style token → friendly "lien invalide" view.
// On valid token → branded welcome with sponsor's first name, value
// proposition, and a CTA "Créer mon compte" pointing to
// /fr/auth/register?sponsor=<token>.

import Link from 'next/link';
import { Crown, PawPrint, Gift } from 'lucide-react';
import { verifyReferralToken } from '@/lib/referral-token';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';

type Params = { params: Promise<{ token: string }> };
interface SearchParams { lang?: string }

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const L = {
  fr: {
    title: 'Vous êtes invité',
    subtitleSuffix: ' vous a invité chez Dog Universe.',
    subtitleAnon: 'Un client de Dog Universe vous a invité.',
    welcome: 'Pension de luxe pour chiens et chats à Marrakech — séjours en suites, taxi pet-friendly, soins quotidiens, photos en temps réel.',
    cta: 'Créer mon compte',
    learnMore: 'En savoir plus',
    perks: [
      { icon: PawPrint, label: 'Suites privatives, climatisation, sortie quotidienne' },
      { icon: Gift, label: '1ère réservation : -10 % offert grâce à votre parrain' },
      { icon: Crown, label: 'Programme fidélité dès le 1er séjour' },
    ],
    expired: 'Lien invalide',
    expiredBody: 'Ce lien de parrainage n\'est pas valide. Demandez à votre ami un nouveau lien.',
    backHome: 'Retour à Dog Universe',
    languageToggle: 'EN',
    languageToggleHref: '?lang=en',
    poweredBy: 'Programme Parrainage Royal',
  },
  en: {
    title: "You're invited",
    subtitleSuffix: ' invited you to Dog Universe.',
    subtitleAnon: 'A Dog Universe member invited you.',
    welcome: 'Luxury boarding for dogs and cats in Marrakech — private suites, pet-friendly taxi, daily care, live photos.',
    cta: 'Create my account',
    learnMore: 'Learn more',
    perks: [
      { icon: PawPrint, label: 'Private suites, AC, daily outdoor time' },
      { icon: Gift, label: 'First booking : -10% thanks to your sponsor' },
      { icon: Crown, label: 'Loyalty rewards from your first stay' },
    ],
    expired: 'Invalid link',
    expiredBody: 'This referral link is not valid. Ask your friend for a fresh one.',
    backHome: 'Back to Dog Universe',
    languageToggle: 'FR',
    languageToggleHref: '?lang=fr',
    poweredBy: 'Royal Sponsorship program',
  },
} as const;

export const metadata = {
  robots: { index: false, follow: false },
  title: 'Invitation — Dog Universe',
};

export default async function SponsorLandingPage({
  params,
  searchParams,
}: Params & { searchParams: Promise<SearchParams> }) {
  const { token } = await params;
  const { lang } = await searchParams;
  const locale: 'fr' | 'en' = lang === 'en' ? 'en' : 'fr';
  const l = L[locale];

  const verified = verifyReferralToken(token);

  if (!verified) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-[#FAF6F0] to-[#FEFCF9] flex items-center justify-center px-4 py-8">
        <div className="max-w-md w-full bg-white rounded-3xl border border-[#C4974A]/30 shadow-[0_10px_30px_rgba(196,151,74,0.15)] p-8 text-center">
          <Crown className="h-10 w-10 text-[#C4974A]/40 mx-auto mb-3" />
          <h1 className="font-serif text-2xl font-bold text-[#2A2520] mb-2">{l.expired}</h1>
          <p className="text-sm text-[#8A7E75] mb-6">{l.expiredBody}</p>
          <Link href="/" className="inline-block px-5 py-2 rounded-full bg-[#C4974A] text-white text-sm font-medium hover:bg-[#A8823F] transition-colors">
            {l.backHome}
          </Link>
        </div>
      </main>
    );
  }

  const sponsor = await prisma.user.findFirst({
    where: notDeleted({ id: verified.sponsorId, isWalkIn: false }),
    select: { firstName: true, name: true, anonymizedAt: true },
  });

  // PII reduction: first name only, and only if the account is reachable.
  const sponsorFirstName = sponsor && !sponsor.anonymizedAt
    ? sponsor.firstName ?? sponsor.name?.split(/\s+/)[0] ?? null
    : null;

  const registerHref = `/${locale}/auth/register?sponsor=${encodeURIComponent(token)}`;

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FAF6F0] via-[#FEFCF9] to-[#FAF6F0] py-10 px-4">
      <div className="max-w-md mx-auto">
        <header className="flex items-center justify-between mb-6">
          <p className="text-[10px] uppercase tracking-[3px] text-[#C4974A] font-semibold">
            {l.poweredBy}
          </p>
          <Link
            href={l.languageToggleHref}
            className="text-xs px-2.5 py-1 rounded-full border border-[#C4974A]/40 text-[#C4974A] hover:bg-[#C4974A]/10 transition-colors"
            aria-label="Toggle language"
          >
            {l.languageToggle}
          </Link>
        </header>

        <div className="bg-white rounded-3xl overflow-hidden border border-[#C4974A]/30 shadow-[0_10px_30px_rgba(196,151,74,0.15)]">
          {/* Hero */}
          <div className="relative bg-gradient-to-br from-[#1C1612] via-[#2A1E15] to-[#1C1612] p-6 sm:p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#C4974A]/20 border-2 border-[#C4974A]/50 mb-4">
              <Crown className="h-8 w-8 text-[#C9A84C]" />
            </div>
            <h1 className="font-serif text-3xl font-bold text-[#F5EDD8] mb-2">{l.title}</h1>
            <p className="text-sm text-[#C9A84C]">
              {sponsorFirstName ? (
                <>
                  <span className="font-semibold">{sponsorFirstName}</span>{l.subtitleSuffix}
                </>
              ) : (
                l.subtitleAnon
              )}
            </p>
          </div>

          {/* Body */}
          <div className="p-6 sm:p-8 space-y-5">
            <p className="text-sm text-[#2A2520] leading-relaxed text-center">{l.welcome}</p>

            <ul className="space-y-3">
              {l.perks.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-start gap-3 text-sm text-[#2A2520]">
                  <span className="inline-flex w-8 h-8 rounded-full bg-[#C4974A]/15 items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-[#C4974A]" />
                  </span>
                  <span className="leading-snug pt-1">{label}</span>
                </li>
              ))}
            </ul>

            <Link
              href={registerHref}
              className="block w-full text-center px-5 py-3 rounded-full bg-[#C4974A] hover:bg-[#A8823F] text-white text-sm font-semibold transition-colors shadow-[0_8px_20px_rgba(196,151,74,0.35)]"
            >
              {l.cta}
            </Link>

            <Link
              href={`/${locale}`}
              className="block text-center text-xs text-[#8A7E75] hover:text-[#C4974A] transition-colors"
            >
              {l.learnMore} →
            </Link>
          </div>
        </div>

        <footer className="text-center mt-6">
          <Link href={`/${locale}`} className="text-xs text-[#8A7E75] hover:text-[#C4974A]">
            Dog Universe · Marrakech 🇲🇦
          </Link>
        </footer>
      </div>
    </main>
  );
}
