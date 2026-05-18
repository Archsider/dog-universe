// Server Component. Styles via CSS Modules → loaded as a static stylesheet
// from /_next/static/css/, which matches the app CSP `style-src-elem 'self'`
// without needing a nonce. This eliminates the per-locale nonce mismatch
// that was breaking AR/EN landing rendering (CSS Modules ARE the classe-
// mondiale fix for our strict CSP, not inline <style nonce> blocks).
//
// Locales: fr (default) / en / ar (RTL handled in layout.tsx).
import { headers } from 'next/headers';
import Link from 'next/link';
import Image from 'next/image';
import { Cormorant_Garamond, DM_Sans, Noto_Naskh_Arabic } from 'next/font/google';
import { PawPrint, Cat, Car, Scissors, ShoppingBag, Star } from 'lucide-react';
import styles from './LandingPage.module.css';

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
interface LandingPageProps {
  locale: string;
}

// Real Google reviews — verifiable on the public business profile.
// First-name + surname initial for privacy. Quotes verbatim in original
// French regardless of UI locale (authentic voice; translating defeats
// the trust signal).
const REAL_TESTIMONIALS = [
  {
    author: 'Mounir H.',
    quote:
      'Un immense merci à Mehdi d’avoir si bien pris soin de mes loulous ! Je recommande vivement cette garderie pour vos animaux de compagnie. C’est un endroit idéal, magique, et surtout parfait pour socialiser les chiens entre eux. Ça se fait rare, mais ça existe désormais grâce à Mehdi !',
  },
  {
    author: 'Marie L.',
    quote:
      'Une pension, que dis-je… une colonie pour chiens incroyable. Mehdi et son équipe sont aux petits soins pour nos animaux, que ce soit avant, pendant ou après le séjour. Je recommande sans hésiter Dog Universe. Le premier séjour pour Mozart en pension et sûrement pas le dernier ! Encore un grand merci de vous être si bien occupé de Mozart pendant notre séjour en France. C’est tellement rassurant de pouvoir compter sur des personnes aussi bienveillantes lorsque nous sommes loin de nos animaux.',
  },
  {
    author: 'Sarah A.',
    quote:
      'J’ai confié mon chat Gaza à cette pension et j’en suis vraiment ravie ! 🐾 L’équipe est très attentionnée, professionnelle et passionnée par les animaux. J’ai eu régulièrement des nouvelles et des photos, ce qui m’a beaucoup rassurée. Gaza a été choyé comme à la maison, il est revenu calme et en pleine forme ! Je recommande cette pension les yeux fermés. Merci encore pour votre bienveillance ! 💕',
  },
];

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
        { icon: PawPrint, photo: '/images/landing/pension.jpg', title: 'Pension', desc: 'Des hébergements confortables, sécurisés et chaleureux pour votre animal, avec un suivi personnalisé.' },
        { icon: Cat, photo: '/images/landing/cats.jpg', title: 'Espace Chats', desc: 'Un espace dédié aux chats, avec arbres à chats, étagères en hauteur et zones de repos.' },
        { icon: Car, photo: '/images/landing/pet-taxi.jpg', title: 'Pet Taxi', desc: 'Transport sécurisé et sans stress pour votre compagnon, vers le vétérinaire, l’aéroport ou partout à Marrakech.' },
        { icon: Scissors, photo: null, title: 'Bain', desc: 'Bain disponible en complément de la pension.' },
        { icon: ShoppingBag, photo: '/images/landing/boutique.jpg', title: 'Boutique', desc: 'Sélection de nutrition ultra premium et accessoires en boutique.' },
      ],
    },
    testi: {
      eyebrow: 'Témoignages',
      title: 'Ce qu’en disent nos familles.',
      note: 'Avis réels, vérifiables sur Google.',
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
        { icon: PawPrint, photo: '/images/landing/pension.jpg', title: 'Boarding', desc: 'Comfortable, secure and warm accommodations for your pet, with personalised attention.' },
        { icon: Cat, photo: '/images/landing/cats.jpg', title: 'Cat Space', desc: 'A dedicated cat space — cat trees, elevated shelves, and quiet resting zones.' },
        { icon: Car, photo: '/images/landing/pet-taxi.jpg', title: 'Pet Taxi', desc: 'Safe, stress-free transport for your companion — to the vet, the airport, or anywhere in Marrakech.' },
        { icon: Scissors, photo: null, title: 'Bath', desc: 'Bath available as an add-on to boarding.' },
        { icon: ShoppingBag, photo: '/images/landing/boutique.jpg', title: 'Shop', desc: 'Curated ultra-premium nutrition and accessories in store.' },
      ],
    },
    testi: {
      eyebrow: 'Testimonials',
      title: 'What our families say.',
      note: 'Real reviews, verifiable on Google.',
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
        { icon: PawPrint, photo: '/images/landing/pension.jpg', title: 'الإيواء', desc: 'أماكن مريحة وآمنة ودافئة لحيوانك مع متابعة شخصية.' },
        { icon: Cat, photo: '/images/landing/cats.jpg', title: 'فضاء القطط', desc: 'فضاء مخصّص للقطط، مع أشجار قطط، ورفوف مرتفعة، ومناطق هادئة للراحة.' },
        { icon: Car, photo: '/images/landing/pet-taxi.jpg', title: 'بيت تاكسي', desc: 'نقل آمن وخالٍ من التوتر لرفيقك إلى الطبيب البيطري أو المطار أو أيّ مكان في مراكش.' },
        { icon: Scissors, photo: null, title: 'الاستحمام', desc: 'حمام متاح كإضافة لخدمة الإيواء.' },
        { icon: ShoppingBag, photo: '/images/landing/boutique.jpg', title: 'المتجر', desc: 'تشكيلة مختارة من التغذية الفاخرة والإكسسوارات في المتجر.' },
      ],
    },
    testi: {
      eyebrow: 'آراء العملاء',
      title: 'ماذا تقول عائلاتنا.',
      note: 'آراء حقيقية، يمكن التحقّق منها على جوجل.',
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

// Helper: combine multiple CSS Module class names. Filters falsy so we can
// pass empty strings and undefined safely.
function cn(...names: Array<string | false | undefined>): string {
  return names.filter(Boolean).map((n) => styles[n as string] ?? '').join(' ').trim();
}

export default async function LandingPage({ locale }: LandingPageProps) {
  const safeLocale: Locale = (['fr', 'en', 'ar'] as const).includes(locale as Locale)
    ? (locale as Locale)
    : 'fr';
  const isRtl = safeLocale === 'ar';
  const t = COPY[safeLocale];

  // The JSON-LD <script> still needs a nonce (script-src 'nonce-...').
  // CSP for scripts is strict; we keep nonce only for this single tag.
  const nonce = (await headers()).get('x-nonce') ?? '';

  const rootClass = [
    styles['du-root'],
    cormorant.variable,
    dmSans.variable,
    notoArabic.variable,
    isRtl ? styles['du-rtl'] : '',
  ]
    .filter(Boolean)
    .join(' ');

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
        email: 'contact@doguniverse.ma',
        address: { '@type': 'PostalAddress', addressLocality: 'Marrakech', addressCountry: 'MA' },
        areaServed: { '@type': 'City', name: 'Marrakech' },
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.9',
          reviewCount: '310',
          bestRating: '5',
          worstRating: '1',
        },
      },
      { '@type': 'Service', serviceType: 'Pet Boarding', provider: { '@id': `${baseUrl}/#organization` }, areaServed: 'Marrakech' },
      { '@type': 'Service', serviceType: 'Pet Taxi', provider: { '@id': `${baseUrl}/#organization` }, areaServed: 'Marrakech' },
      { '@type': 'Service', serviceType: 'Pet Grooming', provider: { '@id': `${baseUrl}/#organization` }, areaServed: 'Marrakech' },
    ],
  };

  return (
    <div className={rootClass}>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }}
      />

      {/* ─── Nav ───────────────────────────────────────────────────────── */}
      <nav className={styles['du-nav']} aria-label="Primary">
        <div className={styles['du-nav-inner']}>
          <Link href={`/${safeLocale}`} className={styles['du-nav-logo']} aria-label="Dog Universe">
            Dog Universe
          </Link>
          <div className={styles['du-nav-actions']}>
            <div className={styles['du-langs']} role="group" aria-label="Language">
              {(['fr', 'en', 'ar'] as const).map((l) => (
                <Link
                  key={l}
                  href={`/${l}`}
                  className={cn('du-lang', l === safeLocale && 'is-active')}
                  aria-current={l === safeLocale ? 'page' : undefined}
                >
                  {l.toUpperCase()}
                </Link>
              ))}
            </div>
            <Link href={`/${safeLocale}/auth/login`} className={styles['du-nav-link']}>
              {t.nav.space}
            </Link>
            <Link href={`/${safeLocale}/auth/register`} className={styles['du-nav-cta']}>
              {t.nav.book}
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* ─── Hero ─────────────────────────────────────────────────────── */}
        <section className={styles['du-hero']} aria-labelledby="hero-title">
          <div className={styles['du-hero-inner']}>
            <span className={styles['du-hero-badge']}>{t.hero.badge}</span>
            <h1 id="hero-title" className={cn('du-italic', 'du-hero-title')}>{t.hero.title}</h1>
            <p className={cn('du-italic', 'du-hero-sub')}>{t.hero.subtitle}</p>
            <Link href={`/${safeLocale}/auth/register`} className={styles['du-gold-btn']}>
              {t.hero.cta}
            </Link>
          </div>
        </section>

        {/* ─── Stats ────────────────────────────────────────────────────── */}
        <section className={styles['du-stats']} aria-label="Stats">
          <div className={styles['du-stats-inner']}>
            <div className={styles['du-stats-grid']}>
              {[
                { big: t.stats.a1, small: t.stats.a2 },
                { big: t.stats.b1, small: t.stats.b2 },
                { big: t.stats.c1, small: t.stats.c2 },
              ].map((s, i) => (
                <div key={i} className={styles['du-stat']}>
                  <div className={cn('du-italic', 'du-stat-big')}>{s.big}</div>
                  <div className={cn('du-eyebrow', 'du-stat-small')}>{s.small}</div>
                </div>
              ))}
            </div>
            <p className={cn('du-italic', 'du-stats-tag')}>{t.stats.tag}</p>
          </div>
        </section>

        {/* ─── Services ─────────────────────────────────────────────────── */}
        <section id="services" className={styles['du-services']} aria-labelledby="services-title">
          <div className={styles['du-services-inner']}>
            <div className={styles['du-services-head']}>
              <div className={styles['du-eyebrow']}>{t.services.eyebrow}</div>
              <h2 id="services-title" className={cn('du-italic', 'du-services-title')}>
                {t.services.title}
              </h2>
            </div>
            <div className={styles['du-services-grid']}>
              {t.services.items.map((service) => {
                const Icon = service.icon;
                return (
                  <article key={service.title} className={styles['du-card']}>
                    {service.photo ? (
                      // Real photo. `sizes` tells Next.js to serve a
                      // smaller variant at narrower viewports — the
                      // landing has up-to-5 cards/row on desktop and
                      // 1 on mobile.
                      <div className={styles['du-card-photo-wrap']}>
                        <Image
                          src={service.photo}
                          alt={service.title}
                          fill
                          sizes="(max-width: 600px) 100vw, (max-width: 900px) 33vw, 20vw"
                          className={styles['du-card-photo-img']}
                        />
                      </div>
                    ) : (
                      <div className={styles['du-card-photo']}>
                        <Icon className={styles['du-card-photo-icon']} aria-hidden />
                      </div>
                    )}
                    <div className={styles['du-card-body']}>
                      <h3 className={cn('du-italic', 'du-card-title')}>{service.title}</h3>
                      <p className={styles['du-card-desc']}>{service.desc}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── Testimonials (real Google reviews) ───────────────────────── */}
        <section className={styles['du-testi']} aria-labelledby="testi-title">
          <div className={styles['du-testi-inner']}>
            <div className={styles['du-testi-head']}>
              <div className={styles['du-eyebrow']}>{t.testi.eyebrow}</div>
              <h2 id="testi-title" className={cn('du-italic', 'du-testi-title')}>
                {t.testi.title}
              </h2>
            </div>
            <div className={styles['du-testi-grid']}>
              {REAL_TESTIMONIALS.map((testi) => (
                <blockquote key={testi.author} className={styles['du-testi-card']}>
                  <div className={styles['du-testi-stars']} aria-label="5 / 5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star key={i} className={styles['du-testi-star']} aria-hidden />
                    ))}
                  </div>
                  <p className={styles['du-testi-quote']}>“{testi.quote}”</p>
                  <footer className={styles['du-testi-author']}>{testi.author}</footer>
                </blockquote>
              ))}
            </div>
            <p className={styles['du-testi-note']}>{t.testi.note}</p>
          </div>
        </section>

        {/* ─── CTA final ────────────────────────────────────────────────── */}
        <section className={styles['du-final']} aria-labelledby="final-title">
          <h2 id="final-title" className={cn('du-italic', 'du-final-title')}>
            {t.final.title}
          </h2>
          <p className={cn('du-italic', 'du-final-sub')}>{t.final.sub}</p>
          <Link href={`/${safeLocale}/auth/register`} className={styles['du-gold-btn']}>
            {t.final.cta}
          </Link>
        </section>
      </main>

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <footer className={styles['du-footer']}>
        <div className={styles['du-footer-inner']}>
          <span>{t.footer.copy}</span>
          <div className={styles['du-footer-links']}>
            <Link href={`/${safeLocale}/privacy`} className={styles['du-footer-link']}>
              {t.footer.privacy}
            </Link>
            <span className={styles['du-footer-sep']}>·</span>
            <Link href={`/${safeLocale}/terms`} className={styles['du-footer-link']}>
              {t.footer.terms}
            </Link>
            <span className={styles['du-footer-sep']}>·</span>
            <a href="mailto:contact@doguniverse.ma" className={styles['du-footer-link']}>
              contact@doguniverse.ma
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
