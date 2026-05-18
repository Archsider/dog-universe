// Server Component — no client-side state. Public landing route, the highest-
// leverage place to keep the bundle small (every anon visitor hits it).
import Link from 'next/link';
import { Cormorant_Garamond, DM_Sans } from 'next/font/google';
import { PawPrint, Car, Scissors, ShoppingBag } from 'lucide-react';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400'],
  style: ['italic'],
  display: 'swap',
  variable: '--font-cormorant',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  display: 'swap',
  variable: '--font-dmsans',
});

const COLOR = {
  cream: '#f5efe3',
  gold: '#9a7b2e',
  goldSoft: 'rgba(154,123,46,0.18)',
  goldVerySoft: 'rgba(154,123,46,0.10)',
  black: '#0f0d0a',
  textOnBlack: '#f5edd8',
  goldMuted: 'rgba(201,168,76,0.7)',
  white: '#ffffff',
};

interface LandingPageProps {
  locale: string;
}

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-dmsans), sans-serif',
  fontWeight: 500,
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.2em',
  color: COLOR.gold,
};

const headingItalicStyle: React.CSSProperties = {
  fontFamily: 'var(--font-cormorant), serif',
  fontStyle: 'italic',
  fontWeight: 300,
  margin: 0,
  lineHeight: 1.1,
};

export default function LandingPage({ locale }: LandingPageProps) {
  const isFr = locale === 'fr';

  const copy = {
    nav: {
      space: isFr ? 'Mon espace client' : 'Client area',
      book: isFr ? 'Réserver' : 'Book',
    },
    hero: {
      badge: isFr
        ? 'La première pension digitalisée du Maroc'
        : 'The first digital pet boarding in Morocco',
      title: isFr ? '10 ans d’avance.' : '10 years ahead.',
      subtitle: isFr
        ? 'Pensé pour eux. Fait pour vous.'
        : 'Designed for them. Made for you.',
      cta: isFr ? 'Réserver maintenant' : 'Book now',
    },
    stats: {
      a1: isFr ? '10 ans' : '10 years',
      a2: isFr ? 'D’expérience' : 'Of experience',
      b1: '500+',
      b2: isFr ? 'Familles' : 'Families',
      c1: '4.9 ★',
      c2: isFr ? 'Google · 310 avis' : 'Google · 310 reviews',
      tag: isFr
        ? 'Ils sont revenus. Encore. Et encore.'
        : 'They came back. Again. And again.',
    },
    services: {
      eyebrow: isFr ? 'Ce que nous faisons' : 'What we do',
      title: isFr ? 'Un univers complet pour eux.' : 'A complete universe for them.',
      items: [
        {
          icon: PawPrint,
          title: isFr ? 'Pension' : 'Boarding',
          desc: isFr
            ? 'Séjours premium pour chiens et chats à Marrakech.'
            : 'Premium stays for dogs and cats in Marrakech.',
        },
        {
          icon: Car,
          title: isFr ? 'Transport' : 'Transport',
          desc: isFr
            ? 'Pet taxi 7j/7, suivi GPS en temps réel.'
            : 'Pet taxi 7 days a week, live GPS tracking.',
        },
        {
          icon: Scissors,
          title: isFr ? 'Toilettage' : 'Grooming',
          desc: isFr
            ? 'Bain, brossage et coupe par nos spécialistes.'
            : 'Bath, brush and trim by our specialists.',
        },
        {
          icon: ShoppingBag,
          title: isFr ? 'Boutique' : 'Shop',
          desc: isFr
            ? 'Nutrition ultra premium et accessoires sélectionnés.'
            : 'Ultra premium food and curated accessories.',
        },
      ],
    },
    final: {
      title: isFr ? 'Prêts à leur offrir l’univers ?' : 'Ready to give them the universe?',
      sub: isFr ? 'Réservez en quelques minutes.' : 'Book in just a few minutes.',
      cta: isFr ? 'Réserver maintenant' : 'Book now',
    },
    footer: {
      copy: '© 2026 Dog Universe — Marrakech',
      privacy: isFr ? 'Confidentialité' : 'Privacy',
      terms: isFr ? 'CGU' : 'Terms',
    },
  };

  const goldButtonStyle: React.CSSProperties = {
    display: 'inline-block',
    background: COLOR.gold,
    color: COLOR.black,
    fontFamily: 'var(--font-dmsans), sans-serif',
    fontWeight: 500,
    fontSize: '11px',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    padding: '14px 32px',
    borderRadius: '3px',
    textDecoration: 'none',
    transition: 'background 0.15s, transform 0.15s',
  };

  return (
    <div
      className={`min-h-screen ${cormorant.variable} ${dmSans.variable}`}
      style={{
        background: COLOR.cream,
        fontFamily: 'var(--font-dmsans), sans-serif',
        color: COLOR.black,
      }}
    >
      <style>{`
        .du-gold-btn:hover { background: #7d6424 !important; }
        .du-nav-link:hover { color: ${COLOR.gold} !important; }
        .du-service-card { transition: transform 0.2s, box-shadow 0.2s; }
        .du-service-card:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(15,13,10,0.06); }
      `}</style>

      {/* ─── Nav ───────────────────────────────────────────────────────── */}
      <nav style={{ background: COLOR.black, borderBottom: `1px solid rgba(154,123,46,0.18)` }}>
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '0 32px',
            height: '72px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            href={`/${locale}`}
            style={{
              fontFamily: 'var(--font-cormorant), serif',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '22px',
              color: COLOR.gold,
              letterSpacing: '0.04em',
              textDecoration: 'none',
            }}
          >
            Dog Universe
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Link
              href={`/${locale}/auth/login`}
              className="du-nav-link"
              style={{
                fontFamily: 'var(--font-dmsans), sans-serif',
                fontWeight: 400,
                fontSize: '12px',
                color: COLOR.textOnBlack,
                letterSpacing: '0.05em',
                padding: '10px 18px',
                border: `0.5px solid rgba(154,123,46,0.4)`,
                borderRadius: '3px',
                textDecoration: 'none',
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {copy.nav.space}
            </Link>
            <Link
              href={`/${locale}/auth/register`}
              className="du-gold-btn"
              style={{
                background: COLOR.gold,
                color: COLOR.black,
                fontFamily: 'var(--font-dmsans), sans-serif',
                fontWeight: 500,
                fontSize: '11px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                padding: '11px 22px',
                borderRadius: '3px',
                textDecoration: 'none',
                transition: 'background 0.15s',
              }}
            >
              {copy.nav.book}
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* ─── Hero ─────────────────────────────────────────────────────── */}
        <section style={{ background: COLOR.black, padding: '96px 32px' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
            <span
              style={{
                display: 'inline-block',
                fontFamily: 'var(--font-dmsans), sans-serif',
                fontWeight: 500,
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                color: COLOR.gold,
                background: COLOR.goldVerySoft,
                border: `0.5px solid rgba(154,123,46,0.4)`,
                borderRadius: '999px',
                padding: '8px 18px',
                marginBottom: '40px',
              }}
            >
              {copy.hero.badge}
            </span>
            <h1 style={{ ...headingItalicStyle, fontSize: '72px', color: COLOR.textOnBlack }}>
              {copy.hero.title}
            </h1>
            <p
              style={{
                ...headingItalicStyle,
                fontSize: '20px',
                color: COLOR.goldMuted,
                marginTop: '20px',
                marginBottom: '48px',
              }}
            >
              {copy.hero.subtitle}
            </p>
            <Link href={`/${locale}/auth/register`} className="du-gold-btn" style={goldButtonStyle}>
              {copy.hero.cta}
            </Link>
          </div>
        </section>

        {/* ─── Stats ────────────────────────────────────────────────────── */}
        <section
          style={{
            background: COLOR.white,
            borderTop: `0.5px solid ${COLOR.goldSoft}`,
            borderBottom: `0.5px solid ${COLOR.goldSoft}`,
            padding: '64px 32px',
          }}
        >
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                textAlign: 'center',
              }}
            >
              {[
                { big: copy.stats.a1, small: copy.stats.a2 },
                { big: copy.stats.b1, small: copy.stats.b2 },
                { big: copy.stats.c1, small: copy.stats.c2 },
              ].map((stat, i) => (
                <div
                  key={i}
                  style={{
                    padding: '8px 0',
                    borderLeft: i === 0 ? 'none' : `0.5px solid ${COLOR.goldSoft}`,
                  }}
                >
                  <div
                    style={{
                      ...headingItalicStyle,
                      fontSize: '44px',
                      color: COLOR.black,
                    }}
                  >
                    {stat.big}
                  </div>
                  <div
                    style={{
                      ...sectionLabelStyle,
                      marginTop: '10px',
                    }}
                  >
                    {stat.small}
                  </div>
                </div>
              ))}
            </div>
            <p
              style={{
                ...headingItalicStyle,
                fontSize: '18px',
                color: COLOR.goldMuted,
                textAlign: 'center',
                marginTop: '48px',
              }}
            >
              {copy.stats.tag}
            </p>
          </div>
        </section>

        {/* ─── Services ─────────────────────────────────────────────────── */}
        <section style={{ background: COLOR.cream, padding: '96px 32px' }}>
          <div style={{ maxWidth: '960px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '64px' }}>
              <div style={sectionLabelStyle}>{copy.services.eyebrow}</div>
              <h2
                style={{
                  ...headingItalicStyle,
                  fontSize: '42px',
                  color: COLOR.black,
                  marginTop: '16px',
                }}
              >
                {copy.services.title}
              </h2>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '20px',
              }}
            >
              {copy.services.items.map((service) => {
                const Icon = service.icon;
                return (
                  <div
                    key={service.title}
                    className="du-service-card"
                    style={{
                      background: COLOR.white,
                      border: `0.5px solid ${COLOR.goldSoft}`,
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Photo placeholder — gradient + icon. Swap with <Image> later. */}
                    <div
                      style={{
                        height: '130px',
                        background: `linear-gradient(135deg, #1a1612 0%, #2a1f15 60%, #3a2d1c 100%)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon
                        style={{
                          width: '38px',
                          height: '38px',
                          color: 'rgba(201,168,76,0.55)',
                        }}
                      />
                    </div>
                    <div style={{ padding: '20px 18px 22px' }}>
                      <h3
                        style={{
                          ...headingItalicStyle,
                          fontSize: '20px',
                          color: COLOR.black,
                          marginBottom: '8px',
                        }}
                      >
                        {service.title}
                      </h3>
                      <p
                        style={{
                          fontFamily: 'var(--font-dmsans), sans-serif',
                          fontWeight: 300,
                          fontSize: '11px',
                          lineHeight: 1.6,
                          color: 'rgba(15,13,10,0.65)',
                          margin: 0,
                        }}
                      >
                        {service.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── CTA final ────────────────────────────────────────────────── */}
        <section style={{ background: COLOR.black, padding: '80px 32px', textAlign: 'center' }}>
          <h2 style={{ ...headingItalicStyle, fontSize: '42px', color: COLOR.textOnBlack }}>
            {copy.final.title}
          </h2>
          <p
            style={{
              ...headingItalicStyle,
              fontSize: '18px',
              color: COLOR.goldMuted,
              marginTop: '16px',
              marginBottom: '40px',
            }}
          >
            {copy.final.sub}
          </p>
          <Link href={`/${locale}/auth/register`} className="du-gold-btn" style={goldButtonStyle}>
            {copy.final.cta}
          </Link>
        </section>
      </main>

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <footer style={{ background: COLOR.black, padding: '32px 0' }}>
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '0 32px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-dmsans), sans-serif',
            fontSize: '12px',
            color: 'rgba(245,237,216,0.3)',
          }}
        >
          <span>{copy.footer.copy}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <Link
              href={`/${locale}/privacy`}
              className="du-nav-link"
              style={{ color: 'rgba(245,237,216,0.3)', textDecoration: 'none', transition: 'color 0.15s' }}
            >
              {copy.footer.privacy}
            </Link>
            <span style={{ color: 'rgba(245,237,216,0.2)' }}>·</span>
            <Link
              href={`/${locale}/terms`}
              className="du-nav-link"
              style={{ color: 'rgba(245,237,216,0.3)', textDecoration: 'none', transition: 'color 0.15s' }}
            >
              {copy.footer.terms}
            </Link>
            <span style={{ color: 'rgba(245,237,216,0.2)' }}>·</span>
            <a
              href="mailto:contact@doguniverse.ma"
              className="du-nav-link"
              style={{ color: 'rgba(245,237,216,0.3)', textDecoration: 'none', transition: 'color 0.15s' }}
            >
              contact@doguniverse.ma
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
