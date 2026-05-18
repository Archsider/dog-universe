// Server Component (async — reads x-nonce from middleware headers).
// All styles in a single nonce-guarded <style> block to satisfy strict CSP
// (style-src-attr 'none', style-src-elem 'nonce-...').
// Locales: fr (default) / en / ar (RTL handled in layout.tsx).
import { headers } from 'next/headers';
import Link from 'next/link';
import { Cormorant_Garamond, DM_Sans, Noto_Naskh_Arabic } from 'next/font/google';
import { PawPrint, Car, Scissors, ShoppingBag } from 'lucide-react';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  style: ['italic', 'normal'],
  display: 'swap',
  variable: '--font-cormorant',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  display: 'swap',
  variable: '--font-dmsans',
});

const notoArabic = Noto_Naskh_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-arabic',
});

type Locale = 'fr' | 'en' | 'ar';
interface LandingPageProps { locale: string }

const COPY = {
  fr: {
    nav: { space: 'Mon espace client', book: 'Réserver' },
    hero: {
      badge: 'La première pension digitalisée du Maroc',
      title: '10 ans d’avance.',
      subtitle: 'Pensé pour eux. Fait pour vous.',
      cta: 'Réserver maintenant',
    },
    stats: {
      a1: '10 ans', a2: 'D’expérience',
      b1: '500+', b2: 'Familles',
      c1: '4.9 ★', c2: 'Google · 310 avis',
      tag: 'Ils sont revenus. Encore. Et encore.',
    },
    services: {
      eyebrow: 'Ce que nous faisons',
      title: 'Un univers complet pour eux.',
      items: [
        { icon: PawPrint, title: 'Pension', desc: 'Des hébergements confortables, sécurisés et chaleureux pour votre animal, avec un suivi personnalisé.' },
        { icon: Car, title: 'Pet Taxi', desc: 'Transport sécurisé et sans stress pour votre compagnon, vers le vétérinaire, l’aéroport ou partout à Marrakech.' },
        { icon: Scissors, title: 'Toilettage', desc: 'Bain disponible en complément de la pension.' },
        { icon: ShoppingBag, title: 'Boutique', desc: 'Sélection de nutrition ultra premium et accessoires en boutique.' },
      ],
    },
    pricing: {
      eyebrow: 'Tarifs',
      title: 'Transparents, sans surprise.',
      groups: [
        { title: 'Pension / nuit', icon: PawPrint, rows: [['Chien', '120 MAD'], ['Chat', '70 MAD']] },
        { title: 'Bain (add-on pension)', icon: Scissors, rows: [['Petit chien', '100 MAD'], ['Grand chien', '150 MAD']] },
        { title: 'Pet Taxi — Marrakech', icon: Car, rows: [['Course standard', '150 MAD'], ['Transport vétérinaire', '300 MAD'], ['Navette aéroport', '300 MAD']] },
      ],
    },
    final: {
      title: 'Prêts à leur offrir l’univers ?',
      sub: 'Réservez en quelques minutes.',
      cta: 'Réserver maintenant',
    },
    footer: {
      copy: '© 2026 Dog Universe — Marrakech',
      privacy: 'Confidentialité', terms: 'CGU',
    },
  },
  en: {
    nav: { space: 'My account', book: 'Book' },
    hero: {
      badge: 'The first digital pet boarding in Morocco',
      title: '10 years ahead.',
      subtitle: 'Designed for them. Made for you.',
      cta: 'Book now',
    },
    stats: {
      a1: '10 years', a2: 'Of experience',
      b1: '500+', b2: 'Families',
      c1: '4.9 ★', c2: 'Google · 310 reviews',
      tag: 'They came back. Again. And again.',
    },
    services: {
      eyebrow: 'What we do',
      title: 'A complete universe for them.',
      items: [
        { icon: PawPrint, title: 'Boarding', desc: 'Comfortable, secure and warm accommodations for your pet, with personalised attention.' },
        { icon: Car, title: 'Pet Taxi', desc: 'Safe, stress-free transport for your companion — to the vet, the airport, or anywhere in Marrakech.' },
        { icon: Scissors, title: 'Grooming', desc: 'Bath available as an add-on to boarding.' },
        { icon: ShoppingBag, title: 'Shop', desc: 'Curated ultra-premium nutrition and accessories in store.' },
      ],
    },
    pricing: {
      eyebrow: 'Pricing',
      title: 'Transparent. No surprise.',
      groups: [
        { title: 'Boarding / night', icon: PawPrint, rows: [['Dog', '120 MAD'], ['Cat', '70 MAD']] },
        { title: 'Bath (boarding add-on)', icon: Scissors, rows: [['Small dog', '100 MAD'], ['Large dog', '150 MAD']] },
        { title: 'Pet Taxi — Marrakech', icon: Car, rows: [['Standard trip', '150 MAD'], ['Vet transport', '300 MAD'], ['Airport transfer', '300 MAD']] },
      ],
    },
    final: {
      title: 'Ready to give them the universe?',
      sub: 'Book in just a few minutes.',
      cta: 'Book now',
    },
    footer: {
      copy: '© 2026 Dog Universe — Marrakech',
      privacy: 'Privacy', terms: 'Terms',
    },
  },
  ar: {
    nav: { space: 'حسابي', book: 'احجز' },
    hero: {
      badge: 'أوّل دار رقمية للحيوانات الأليفة في المغرب',
      title: '١٠ سنوات من التقدّم.',
      subtitle: 'مصمَّمة لهم. مخصَّصة لك.',
      cta: 'احجز الآن',
    },
    stats: {
      a1: '١٠ سنوات', a2: 'من الخبرة',
      b1: '+٥٠٠', b2: 'عائلة',
      c1: '٤٫٩ ★', c2: 'جوجل · ٣١٠ تقييم',
      tag: 'لقد عادوا. مرّةً وأخرى.',
    },
    services: {
      eyebrow: 'ماذا نقدّم',
      title: 'عالم متكامل لهم.',
      items: [
        { icon: PawPrint, title: 'الإيواء', desc: 'أماكن مريحة وآمنة ودافئة لحيوانك مع متابعة شخصية.' },
        { icon: Car, title: 'بيت تاكسي', desc: 'نقل آمن وخالٍ من التوتر لرفيقك إلى الطبيب البيطري أو المطار أو أيّ مكان في مراكش.' },
        { icon: Scissors, title: 'العناية', desc: 'حمام متاح كإضافة لخدمة الإيواء.' },
        { icon: ShoppingBag, title: 'المتجر', desc: 'تشكيلة مختارة من التغذية الفاخرة والإكسسوارات في المتجر.' },
      ],
    },
    pricing: {
      eyebrow: 'الأسعار',
      title: 'شفّافة، بدون مفاجآت.',
      groups: [
        { title: 'الإيواء / ليلة', icon: PawPrint, rows: [['كلب', '١٢٠ درهم'], ['قطّ', '٧٠ درهم']] },
        { title: 'الحمام (إضافة)', icon: Scissors, rows: [['كلب صغير', '١٠٠ درهم'], ['كلب كبير', '١٥٠ درهم']] },
        { title: 'بيت تاكسي — مراكش', icon: Car, rows: [['رحلة عادية', '١٥٠ درهم'], ['نقل بيطري', '٣٠٠ درهم'], ['نقل المطار', '٣٠٠ درهم']] },
      ],
    },
    final: {
      title: 'مستعدّون لمنحهم العالم؟',
      sub: 'احجز في بضع دقائق.',
      cta: 'احجز الآن',
    },
    footer: {
      copy: '© ٢٠٢٦ Dog Universe — مراكش',
      privacy: 'الخصوصية', terms: 'الشروط',
    },
  },
} as const;

const LANDING_CSS = `
.du-root {
  min-height: 100vh;
  background: #f5efe3;
  font-family: var(--font-dmsans), -apple-system, BlinkMacSystemFont, sans-serif;
  color: #0f0d0a;
  scroll-behavior: smooth;
}
.du-root.du-rtl {
  font-family: var(--font-arabic), var(--font-dmsans), -apple-system, sans-serif;
}

/* ─── Reusable ─────────────────────────────────────────────────────── */
.du-eyebrow {
  font-family: var(--font-dmsans), sans-serif;
  font-weight: 500;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: #9a7b2e;
  display: block;
}
.du-rtl .du-eyebrow { font-family: var(--font-arabic), sans-serif; letter-spacing: 0; text-transform: none; font-size: 13px; }
.du-italic {
  font-family: var(--font-cormorant), serif;
  font-style: italic;
  font-weight: 300;
  margin: 0;
  line-height: 1.15;
}
.du-rtl .du-italic { font-family: var(--font-arabic), serif; font-style: normal; font-weight: 500; }
.du-gold-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: #9a7b2e; color: #0f0d0a;
  font-family: var(--font-dmsans), sans-serif;
  font-weight: 500; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase;
  padding: 16px 36px; border-radius: 3px; text-decoration: none;
  transition: background 0.15s, transform 0.15s;
}
.du-rtl .du-gold-btn { font-family: var(--font-arabic), sans-serif; letter-spacing: 0; text-transform: none; font-size: 15px; padding: 14px 32px; }
.du-gold-btn:hover { background: #7d6424; transform: translateY(-1px); }

/* ─── Nav ──────────────────────────────────────────────────────────── */
.du-nav { background: #0f0d0a; border-bottom: 1px solid rgba(154,123,46,0.18); position: sticky; top: 0; z-index: 50; backdrop-filter: blur(8px); }
.du-nav-inner { max-width: 1240px; margin: 0 auto; padding: 0 32px; height: 76px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.du-nav-logo {
  font-family: var(--font-cormorant), serif; font-style: italic; font-weight: 400;
  font-size: 24px; color: #9a7b2e; letter-spacing: 0.04em; text-decoration: none;
  white-space: nowrap;
}
.du-rtl .du-nav-logo { font-family: var(--font-arabic), serif; font-style: normal; font-weight: 700; }
.du-nav-actions { display: flex; align-items: center; gap: 12px; }
.du-langs { display: flex; gap: 4px; margin-right: 14px; }
.du-rtl .du-langs { margin-right: 0; margin-left: 14px; }
.du-lang {
  font-family: var(--font-dmsans), sans-serif;
  font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
  color: rgba(245,237,216,0.5); padding: 6px 8px; text-decoration: none;
  transition: color 0.15s;
}
.du-lang:hover { color: #9a7b2e; }
.du-lang.is-active { color: #9a7b2e; border-bottom: 0.5px solid #9a7b2e; }
.du-nav-link {
  font-family: var(--font-dmsans), sans-serif;
  font-weight: 400; font-size: 13px; color: #f5edd8;
  letter-spacing: 0.05em; padding: 11px 20px;
  border: 0.5px solid rgba(154,123,46,0.4); border-radius: 3px;
  text-decoration: none; transition: color 0.15s, border-color 0.15s;
}
.du-rtl .du-nav-link { font-family: var(--font-arabic), sans-serif; letter-spacing: 0; font-size: 14px; }
.du-nav-link:hover { color: #9a7b2e; border-color: #9a7b2e; }
.du-nav-cta {
  background: #9a7b2e; color: #0f0d0a;
  font-family: var(--font-dmsans), sans-serif;
  font-weight: 500; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase;
  padding: 12px 24px; border-radius: 3px; text-decoration: none;
  transition: background 0.15s;
}
.du-rtl .du-nav-cta { font-family: var(--font-arabic), sans-serif; letter-spacing: 0; text-transform: none; font-size: 14px; padding: 11px 22px; }
.du-nav-cta:hover { background: #7d6424; }

/* ─── Hero ─────────────────────────────────────────────────────────── */
.du-hero {
  background:
    radial-gradient(ellipse 80% 60% at 50% 0%, rgba(154,123,46,0.12), transparent 70%),
    radial-gradient(ellipse 60% 40% at 50% 100%, rgba(154,123,46,0.08), transparent 60%),
    #0f0d0a;
  padding: 140px 32px 120px;
}
.du-hero-inner { max-width: 1000px; margin: 0 auto; text-align: center; }
.du-hero-badge {
  display: inline-block;
  font-family: var(--font-dmsans), sans-serif;
  font-weight: 500; font-size: 12px;
  text-transform: uppercase; letter-spacing: 0.2em; color: #9a7b2e;
  background: rgba(154,123,46,0.10); border: 0.5px solid rgba(154,123,46,0.4);
  border-radius: 999px; padding: 9px 22px; margin-bottom: 48px;
}
.du-rtl .du-hero-badge { font-family: var(--font-arabic), sans-serif; letter-spacing: 0; text-transform: none; font-size: 14px; }
.du-hero-title { font-size: 104px; color: #f5edd8; letter-spacing: -0.01em; }
.du-hero-sub { font-size: 28px; color: rgba(201,168,76,0.85); margin-top: 24px; margin-bottom: 56px; }

/* ─── Stats ────────────────────────────────────────────────────────── */
.du-stats {
  background: #ffffff;
  border-top: 0.5px solid rgba(154,123,46,0.18);
  border-bottom: 0.5px solid rgba(154,123,46,0.18);
  padding: 88px 32px;
}
.du-stats-inner { max-width: 1100px; margin: 0 auto; }
.du-stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); text-align: center; }
.du-stat { padding: 8px 0; }
.du-stat + .du-stat { border-left: 0.5px solid rgba(154,123,46,0.18); }
.du-rtl .du-stat + .du-stat { border-left: none; border-right: 0.5px solid rgba(154,123,46,0.18); }
.du-stat-big { font-size: 56px; color: #0f0d0a; }
.du-stat-small { margin-top: 12px; }
.du-stats-tag {
  font-size: 22px; color: rgba(154,123,46,0.85);
  text-align: center; margin-top: 56px;
}

/* ─── Services ─────────────────────────────────────────────────────── */
.du-services { background: #f5efe3; padding: 128px 32px; }
.du-services-inner { max-width: 1100px; margin: 0 auto; }
.du-services-head { text-align: center; margin-bottom: 72px; }
.du-services-title { font-size: 56px; color: #0f0d0a; margin-top: 16px; }
.du-services-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
.du-card {
  background: #ffffff; border: 0.5px solid rgba(154,123,46,0.18); border-radius: 3px;
  overflow: hidden; transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
  display: flex; flex-direction: column;
}
.du-card:hover { transform: translateY(-3px); box-shadow: 0 12px 28px rgba(15,13,10,0.08); border-color: rgba(154,123,46,0.35); }
.du-card-photo {
  height: 160px;
  background: linear-gradient(135deg, #1a1612 0%, #2a1f15 60%, #3a2d1c 100%);
  display: flex; align-items: center; justify-content: center;
}
.du-card-photo-icon { width: 44px; height: 44px; color: rgba(201,168,76,0.6); }
.du-card-body { padding: 26px 22px 28px; }
.du-card-title { font-size: 26px; color: #0f0d0a; margin-bottom: 12px; }
.du-card-desc {
  font-family: var(--font-dmsans), sans-serif;
  font-weight: 300; font-size: 14px; line-height: 1.65;
  color: rgba(15,13,10,0.7); margin: 0;
}
.du-rtl .du-card-desc { font-family: var(--font-arabic), sans-serif; font-size: 15px; line-height: 1.85; }

/* ─── Pricing ──────────────────────────────────────────────────────── */
.du-pricing { background: #ffffff; padding: 128px 32px; border-top: 0.5px solid rgba(154,123,46,0.10); }
.du-pricing-inner { max-width: 1100px; margin: 0 auto; }
.du-pricing-head { text-align: center; margin-bottom: 64px; }
.du-pricing-title { font-size: 52px; color: #0f0d0a; margin-top: 16px; }
.du-pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
.du-price-card {
  background: #faf6ec; border: 0.5px solid rgba(154,123,46,0.2); border-radius: 3px;
  padding: 32px 28px;
  display: flex; flex-direction: column;
}
.du-price-head { display: flex; align-items: center; gap: 10px; margin-bottom: 22px; padding-bottom: 18px; border-bottom: 0.5px solid rgba(154,123,46,0.18); }
.du-price-icon { width: 18px; height: 18px; color: #9a7b2e; }
.du-price-title {
  font-family: var(--font-cormorant), serif; font-style: italic; font-weight: 400;
  font-size: 22px; color: #0f0d0a; margin: 0;
}
.du-rtl .du-price-title { font-family: var(--font-arabic), serif; font-style: normal; font-weight: 500; font-size: 20px; }
.du-price-rows { list-style: none; margin: 0; padding: 0; }
.du-price-row {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 12px 0;
  font-family: var(--font-dmsans), sans-serif;
}
.du-rtl .du-price-row { font-family: var(--font-arabic), sans-serif; }
.du-price-row + .du-price-row { border-top: 0.5px solid rgba(154,123,46,0.10); }
.du-price-label { font-size: 14px; color: rgba(15,13,10,0.7); font-weight: 300; }
.du-rtl .du-price-label { font-size: 15px; }
.du-price-value { font-size: 15px; color: #9a7b2e; font-weight: 500; letter-spacing: 0.02em; }
.du-rtl .du-price-value { font-size: 16px; }

/* ─── CTA final ────────────────────────────────────────────────────── */
.du-final {
  background:
    radial-gradient(ellipse 60% 60% at 50% 50%, rgba(154,123,46,0.10), transparent 70%),
    #0f0d0a;
  padding: 112px 32px; text-align: center;
}
.du-final-title { font-size: 56px; color: #f5edd8; }
.du-final-sub { font-size: 22px; color: rgba(201,168,76,0.75); margin-top: 18px; margin-bottom: 48px; }

/* ─── Footer ───────────────────────────────────────────────────────── */
.du-footer { background: #0f0d0a; padding: 40px 0 32px; border-top: 1px solid rgba(154,123,46,0.18); }
.du-footer-inner {
  max-width: 1240px; margin: 0 auto; padding: 0 32px;
  display: flex; flex-wrap: wrap; gap: 16px;
  align-items: center; justify-content: space-between;
  font-family: var(--font-dmsans), sans-serif; font-size: 13px;
  color: rgba(245,237,216,0.35);
}
.du-rtl .du-footer-inner { font-family: var(--font-arabic), sans-serif; }
.du-footer-links { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.du-footer-link { color: rgba(245,237,216,0.4); text-decoration: none; transition: color 0.15s; }
.du-footer-link:hover { color: #9a7b2e; }
.du-footer-sep { color: rgba(245,237,216,0.2); }

/* ─── Responsive ───────────────────────────────────────────────────── */
@media (max-width: 1024px) {
  .du-hero-title { font-size: 80px; }
  .du-services-title, .du-final-title { font-size: 44px; }
  .du-pricing-title { font-size: 42px; }
  .du-stat-big { font-size: 44px; }
}
@media (max-width: 900px) {
  .du-services-grid { grid-template-columns: repeat(2, 1fr); }
  .du-pricing-grid { grid-template-columns: 1fr; max-width: 480px; margin: 0 auto; }
  .du-stats-grid { grid-template-columns: 1fr; gap: 32px; }
  .du-stat + .du-stat { border-left: none; border-top: 0.5px solid rgba(154,123,46,0.18); padding-top: 32px; }
  .du-rtl .du-stat + .du-stat { border-right: none; }
}
@media (max-width: 640px) {
  .du-nav-inner { padding: 0 20px; height: 64px; }
  .du-nav-logo { font-size: 19px; }
  .du-nav-link { display: none; }
  .du-langs { margin-right: 6px; }
  .du-rtl .du-langs { margin-right: 0; margin-left: 6px; }
  .du-hero { padding: 88px 20px 72px; }
  .du-hero-title { font-size: 52px; }
  .du-hero-sub { font-size: 19px; margin-top: 18px; margin-bottom: 40px; }
  .du-hero-badge { font-size: 10px; padding: 7px 16px; margin-bottom: 36px; }
  .du-stats { padding: 64px 20px; }
  .du-stat-big { font-size: 34px; }
  .du-stats-tag { font-size: 17px; margin-top: 40px; }
  .du-services, .du-pricing { padding: 80px 20px; }
  .du-services-title, .du-pricing-title { font-size: 32px; }
  .du-services-grid { grid-template-columns: 1fr; gap: 16px; }
  .du-card-photo { height: 140px; }
  .du-final { padding: 80px 20px; }
  .du-final-title { font-size: 34px; }
  .du-final-sub { font-size: 17px; margin-bottom: 36px; }
  .du-footer-inner { flex-direction: column; text-align: center; }
}
`;

export default async function LandingPage({ locale }: LandingPageProps) {
  const safeLocale: Locale = (['fr', 'en', 'ar'] as const).includes(locale as Locale)
    ? (locale as Locale)
    : 'fr';
  const isRtl = safeLocale === 'ar';
  const t = COPY[safeLocale];

  // CSP nonce from middleware (src/middleware/i18n.ts → x-nonce header)
  const nonce = (await headers()).get('x-nonce') ?? '';

  const rootClass = [
    'du-root',
    cormorant.variable,
    dmSans.variable,
    notoArabic.variable,
    isRtl ? 'du-rtl' : '',
  ].filter(Boolean).join(' ');

  // JSON-LD : LocalBusiness + Service + AggregateRating only.
  // No FAQPage (section removed per brief).
  const baseUrl = 'https://app.doguniverse.ma';
  const ldJson = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['LocalBusiness', 'PetStore'],
        '@id': `${baseUrl}/#organization`,
        name: 'Dog Universe',
        url: baseUrl,
        logo: `${baseUrl}/logo.png`,
        image: `${baseUrl}/logo.png`,
        priceRange: '70-300 MAD',
        email: 'contact@doguniverse.ma',
        address: { '@type': 'PostalAddress', addressLocality: 'Marrakech', addressCountry: 'MA' },
        areaServed: { '@type': 'City', name: 'Marrakech' },
        aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.9', reviewCount: '310', bestRating: '5', worstRating: '1' },
      },
      { '@type': 'Service', serviceType: 'Pet Boarding', provider: { '@id': `${baseUrl}/#organization` }, areaServed: 'Marrakech', offers: { '@type': 'Offer', priceCurrency: 'MAD', price: '70' } },
      { '@type': 'Service', serviceType: 'Pet Taxi', provider: { '@id': `${baseUrl}/#organization` }, areaServed: 'Marrakech', offers: { '@type': 'Offer', priceCurrency: 'MAD', price: '150' } },
      { '@type': 'Service', serviceType: 'Pet Grooming', provider: { '@id': `${baseUrl}/#organization` }, areaServed: 'Marrakech', offers: { '@type': 'Offer', priceCurrency: 'MAD', price: '100' } },
    ],
  };

  return (
    <div className={rootClass}>
      <style nonce={nonce}>{LANDING_CSS}</style>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }}
      />

      {/* ─── Nav ───────────────────────────────────────────────────────── */}
      <nav className="du-nav" aria-label="Primary">
        <div className="du-nav-inner">
          <Link href={`/${safeLocale}`} className="du-nav-logo" aria-label="Dog Universe">
            Dog Universe
          </Link>
          <div className="du-nav-actions">
            <div className="du-langs" role="group" aria-label="Language">
              {(['fr', 'en', 'ar'] as const).map((l) => (
                <Link
                  key={l}
                  href={`/${l}`}
                  className={`du-lang${l === safeLocale ? ' is-active' : ''}`}
                  aria-current={l === safeLocale ? 'page' : undefined}
                >
                  {l.toUpperCase()}
                </Link>
              ))}
            </div>
            <Link href={`/${safeLocale}/auth/login`} className="du-nav-link">{t.nav.space}</Link>
            <Link href={`/${safeLocale}/auth/register`} className="du-nav-cta">{t.nav.book}</Link>
          </div>
        </div>
      </nav>

      <main>
        {/* ─── Hero ─────────────────────────────────────────────────────── */}
        <section className="du-hero" aria-labelledby="hero-title">
          <div className="du-hero-inner">
            <span className="du-hero-badge">{t.hero.badge}</span>
            <h1 id="hero-title" className="du-italic du-hero-title">{t.hero.title}</h1>
            <p className="du-italic du-hero-sub">{t.hero.subtitle}</p>
            <Link href={`/${safeLocale}/auth/register`} className="du-gold-btn">{t.hero.cta}</Link>
          </div>
        </section>

        {/* ─── Stats ────────────────────────────────────────────────────── */}
        <section className="du-stats" aria-label="Stats">
          <div className="du-stats-inner">
            <div className="du-stats-grid">
              {[
                { big: t.stats.a1, small: t.stats.a2 },
                { big: t.stats.b1, small: t.stats.b2 },
                { big: t.stats.c1, small: t.stats.c2 },
              ].map((s, i) => (
                <div key={i} className="du-stat">
                  <div className="du-italic du-stat-big">{s.big}</div>
                  <div className="du-eyebrow du-stat-small">{s.small}</div>
                </div>
              ))}
            </div>
            <p className="du-italic du-stats-tag">{t.stats.tag}</p>
          </div>
        </section>

        {/* ─── Services ─────────────────────────────────────────────────── */}
        <section id="services" className="du-services" aria-labelledby="services-title">
          <div className="du-services-inner">
            <div className="du-services-head">
              <div className="du-eyebrow">{t.services.eyebrow}</div>
              <h2 id="services-title" className="du-italic du-services-title">{t.services.title}</h2>
            </div>
            <div className="du-services-grid">
              {t.services.items.map((service) => {
                const Icon = service.icon;
                return (
                  <article key={service.title} className="du-card">
                    <div className="du-card-photo">
                      <Icon className="du-card-photo-icon" aria-hidden />
                    </div>
                    <div className="du-card-body">
                      <h3 className="du-italic du-card-title">{service.title}</h3>
                      <p className="du-card-desc">{service.desc}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── Pricing ──────────────────────────────────────────────────── */}
        <section className="du-pricing" aria-labelledby="pricing-title">
          <div className="du-pricing-inner">
            <div className="du-pricing-head">
              <div className="du-eyebrow">{t.pricing.eyebrow}</div>
              <h2 id="pricing-title" className="du-italic du-pricing-title">{t.pricing.title}</h2>
            </div>
            <div className="du-pricing-grid">
              {t.pricing.groups.map((group) => {
                const Icon = group.icon;
                return (
                  <div key={group.title} className="du-price-card">
                    <div className="du-price-head">
                      <Icon className="du-price-icon" aria-hidden />
                      <h3 className="du-price-title">{group.title}</h3>
                    </div>
                    <ul className="du-price-rows">
                      {group.rows.map(([label, value]) => (
                        <li key={label} className="du-price-row">
                          <span className="du-price-label">{label}</span>
                          <span className="du-price-value">{value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── CTA final ────────────────────────────────────────────────── */}
        <section className="du-final" aria-labelledby="final-title">
          <h2 id="final-title" className="du-italic du-final-title">{t.final.title}</h2>
          <p className="du-italic du-final-sub">{t.final.sub}</p>
          <Link href={`/${safeLocale}/auth/register`} className="du-gold-btn">{t.final.cta}</Link>
        </section>
      </main>

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <footer className="du-footer">
        <div className="du-footer-inner">
          <span>{t.footer.copy}</span>
          <div className="du-footer-links">
            <Link href={`/${safeLocale}/privacy`} className="du-footer-link">{t.footer.privacy}</Link>
            <span className="du-footer-sep">·</span>
            <Link href={`/${safeLocale}/terms`} className="du-footer-link">{t.footer.terms}</Link>
            <span className="du-footer-sep">·</span>
            <a href="mailto:contact@doguniverse.ma" className="du-footer-link">contact@doguniverse.ma</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
