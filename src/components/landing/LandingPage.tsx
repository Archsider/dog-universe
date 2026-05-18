// Server Component, async — reads x-nonce from middleware headers to satisfy
// the strict CSP (`style-src-elem 'nonce-...'`, `style-src-attr 'none'`,
// `script-src 'nonce-...'`).
//
// All styles live in one nonce-guarded <style> block — no inline
// `style={{...}}` attributes (they would be blocked by style-src-attr 'none',
// see src/middleware/i18n.ts). JSON-LD scripts also carry the nonce.
//
// Locales supported: fr (default) / en / ar (RTL handled in layout.tsx).
import { headers } from 'next/headers';
import Link from 'next/link';
import { Cormorant_Garamond, DM_Sans, Noto_Naskh_Arabic } from 'next/font/google';
import { PawPrint, Car, Scissors, ShoppingBag, ShieldCheck, Clock3, MapPin, HeartHandshake, Star, MessageCircle } from 'lucide-react';

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

// Arabic display font (Noto Naskh Arabic — well-supported, balanced with our
// Latin pair). Loaded only when needed, but next/font is build-time so the
// CSS is always there — fine, < 50KB.
const notoArabic = Noto_Naskh_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-arabic',
});

type Locale = 'fr' | 'en' | 'ar';
interface LandingPageProps { locale: string }

// All copy in one place — keyed by locale. Makes RTL audit + translation work
// trivial. AR copy intentionally a bit shorter where French is wordy.
const COPY: Record<Locale, ReturnType<typeof buildFr>> = {
  fr: buildFr(),
  en: buildEn(),
  ar: buildAr(),
};

function buildFr() {
  return {
    nav: { space: 'Mon espace', book: 'Réserver', langLabel: 'Langue' },
    hero: {
      badge: 'La première pension digitalisée du Maroc',
      title: '10 ans d’avance.',
      subtitle: 'Pensé pour eux. Fait pour vous.',
      desc:
        'Pension premium pour chiens et chats à Marrakech. Réservation en ligne, suivi GPS, photos quotidiennes, vétérinaire 24/7.',
      cta: 'Réserver maintenant',
      ctaAlt: 'Découvrir',
    },
    stats: {
      title: 'La confiance se construit. Encore. Et encore.',
      a1: '10 ans', a2: 'D’expérience',
      b1: '500+', b2: 'Familles fidèles',
      c1: '4.9 ★', c2: 'Google · 310 avis',
      d1: '24/7', d2: 'Suivi vétérinaire',
      tag: 'Ils sont revenus. Encore. Et encore.',
    },
    services: {
      eyebrow: 'Ce que nous faisons',
      title: 'Un univers complet pour eux.',
      sub: 'Pension, transport, toilettage, boutique — pensés pour leur bien-être.',
      items: [
        { icon: PawPrint, title: 'Pension', desc: 'Séjours premium pour chiens et chats, environnements spacieux, sorties quotidiennes.' },
        { icon: Car, title: 'Pet Taxi', desc: 'Transport 7j/7, suivi GPS en temps réel, conducteurs formés.' },
        { icon: Scissors, title: 'Toilettage', desc: 'Bain, brossage et coupe sur mesure par nos spécialistes.' },
        { icon: ShoppingBag, title: 'Boutique', desc: 'Nutrition ultra premium et accessoires sélectionnés.' },
      ],
    },
    why: {
      eyebrow: 'Pourquoi Dog Universe',
      title: 'Le standard que vos animaux méritent.',
      items: [
        { icon: ShieldCheck, title: 'Hygiène irréprochable', desc: 'Protocoles vétérinaires stricts. Nettoyage quotidien. Vaccinations à jour vérifiées.' },
        { icon: HeartHandshake, title: 'Équipe formée', desc: 'Nos collaborateurs sont formés au comportement animal et à la première urgence.' },
        { icon: Clock3, title: 'Disponible 24/7', desc: 'Astreinte vétérinaire et équipe de garde, jour et nuit, sept jours sur sept.' },
        { icon: MapPin, title: 'Au cœur de Marrakech', desc: 'Accès facile depuis Guéliz, Hivernage, Palmeraie. Pet Taxi gratuit dans Marrakech.' },
      ],
    },
    testimonials: {
      eyebrow: 'Ils nous font confiance',
      title: 'Ce qu’en disent nos familles.',
      items: [
        { quote: 'Mehdi et son équipe ont pris soin de Tobie comme s’il était le leur. Photos chaque jour, retour impeccable. Une référence à Marrakech.', name: 'Sophie L.', meta: 'Cliente depuis 2022 · Guéliz' },
        { quote: 'Le seul endroit où je laisse mes deux chats sereine. Espace propre, accueil personnalisé, vétérinaire joignable. Bravo.', name: 'Karim B.', meta: 'Client depuis 2023 · Hivernage' },
        { quote: 'Le suivi GPS du Pet Taxi a changé ma vie. Je vois exactement quand mon chien arrive. Service classe mondiale.', name: 'Léa M.', meta: 'Cliente depuis 2024 · Palmeraie' },
      ],
    },
    faq: {
      eyebrow: 'Questions fréquentes',
      title: 'Tout ce que vous devez savoir.',
      items: [
        { q: 'Quels sont vos tarifs pension ?', a: 'À partir de 70 MAD/nuit pour un chat et 120 MAD/nuit pour un chien. Les tarifs varient selon la durée et les services additionnels (toilettage, taxi). Tout est transparent : aucun frais caché.' },
        { q: 'Mon animal sera-t-il en sécurité ?', a: 'Notre équipe est présente 24/7. Vaccinations vérifiées à l’entrée. Vétérinaire d’astreinte joignable à tout moment. Espaces dédiés chiens / chats, jamais mélangés.' },
        { q: 'Recevrai-je des nouvelles pendant le séjour ?', a: 'Oui. Photos quotidiennes envoyées sur votre espace client. Vous pouvez nous contacter à tout moment par message ou WhatsApp.' },
        { q: 'Le Pet Taxi est-il vraiment 7j/7 ?', a: 'Oui, courses possibles 7j/7 entre 10h et 17h (dimanches inclus pour certains créneaux). Suivi GPS en direct depuis votre espace.' },
        { q: 'Comment réserver ?', a: 'Création de compte en 30 secondes, puis quelques clics pour réserver et confirmer. Paiement à l’arrivée ou en ligne. Annulation gratuite jusqu’à 24h avant.' },
      ],
    },
    final: {
      title: 'Prêts à leur offrir l’univers ?',
      sub: 'Réservez en quelques minutes. Bienvenue dans la famille.',
      cta: 'Réserver maintenant',
      whatsapp: 'Ou contactez-nous sur WhatsApp',
    },
    footer: {
      copy: '© 2026 Dog Universe — Marrakech, Maroc',
      tag: 'Pension · Pet Taxi · Toilettage · Boutique',
      privacy: 'Confidentialité', terms: 'CGU',
    },
  };
}

function buildEn(): ReturnType<typeof buildFr> {
  return {
    nav: { space: 'My space', book: 'Book', langLabel: 'Language' },
    hero: {
      badge: 'The first digital pet boarding in Morocco',
      title: '10 years ahead.',
      subtitle: 'Designed for them. Made for you.',
      desc: 'Premium boarding for dogs and cats in Marrakech. Online booking, GPS tracking, daily photos, 24/7 vet on call.',
      cta: 'Book now', ctaAlt: 'Discover',
    },
    stats: {
      title: 'Trust is built. Again. And again.',
      a1: '10 years', a2: 'Of experience',
      b1: '500+', b2: 'Loyal families',
      c1: '4.9 ★', c2: 'Google · 310 reviews',
      d1: '24/7', d2: 'Vet on call',
      tag: 'They came back. Again. And again.',
    },
    services: {
      eyebrow: 'What we do',
      title: 'A complete universe for them.',
      sub: 'Boarding, transport, grooming, shop — designed for their well-being.',
      items: [
        { icon: PawPrint, title: 'Boarding', desc: 'Premium stays for dogs and cats, spacious environments, daily outings.' },
        { icon: Car, title: 'Pet Taxi', desc: 'Transport 7 days a week, live GPS tracking, trained drivers.' },
        { icon: Scissors, title: 'Grooming', desc: 'Bath, brush and bespoke trim by our specialists.' },
        { icon: ShoppingBag, title: 'Shop', desc: 'Ultra premium nutrition and curated accessories.' },
      ],
    },
    why: {
      eyebrow: 'Why Dog Universe',
      title: 'The standard your pets deserve.',
      items: [
        { icon: ShieldCheck, title: 'Spotless hygiene', desc: 'Strict veterinary protocols. Daily cleaning. Up-to-date vaccinations verified.' },
        { icon: HeartHandshake, title: 'Trained team', desc: 'Our staff is trained in animal behaviour and emergency first response.' },
        { icon: Clock3, title: 'Available 24/7', desc: 'Vet on call and night staff, every day of the year.' },
        { icon: MapPin, title: 'In the heart of Marrakech', desc: 'Easy access from Gueliz, Hivernage, Palmeraie. Free Pet Taxi within Marrakech.' },
      ],
    },
    testimonials: {
      eyebrow: 'They trust us',
      title: 'What our families say.',
      items: [
        { quote: 'Mehdi and his team took care of Tobie like their own. Daily photos, impeccable return. A reference in Marrakech.', name: 'Sophie L.', meta: 'Client since 2022 · Gueliz' },
        { quote: 'The only place where I leave my two cats serene. Clean space, personal welcome, vet reachable. Bravo.', name: 'Karim B.', meta: 'Client since 2023 · Hivernage' },
        { quote: 'The Pet Taxi GPS tracking changed my life. I see exactly when my dog arrives. World-class service.', name: 'Lea M.', meta: 'Client since 2024 · Palmeraie' },
      ],
    },
    faq: {
      eyebrow: 'Frequently asked',
      title: 'Everything you need to know.',
      items: [
        { q: 'What are your boarding rates?', a: 'From 70 MAD/night for a cat and 120 MAD/night for a dog. Rates vary depending on length and add-ons (grooming, taxi). Transparent — no hidden fees.' },
        { q: 'Will my pet be safe?', a: 'Our team is on site 24/7. Vaccinations verified at check-in. Vet on call any time. Dedicated dog / cat spaces, never mixed.' },
        { q: 'Will I get news during the stay?', a: 'Yes. Daily photos on your client portal. You can reach us any time by message or WhatsApp.' },
        { q: 'Is Pet Taxi really 7 days a week?', a: 'Yes, available 7 days a week from 10am to 5pm (selected slots on Sundays). Live GPS tracking from your dashboard.' },
        { q: 'How do I book?', a: 'Create an account in 30 seconds, then book in a few clicks. Pay on arrival or online. Free cancellation up to 24h before.' },
      ],
    },
    final: {
      title: 'Ready to give them the universe?',
      sub: 'Book in just a few minutes. Welcome to the family.',
      cta: 'Book now', whatsapp: 'Or reach us on WhatsApp',
    },
    footer: {
      copy: '© 2026 Dog Universe — Marrakech, Morocco',
      tag: 'Boarding · Pet Taxi · Grooming · Shop',
      privacy: 'Privacy', terms: 'Terms',
    },
  };
}

function buildAr(): ReturnType<typeof buildFr> {
  return {
    nav: { space: 'حسابي', book: 'احجز', langLabel: 'اللغة' },
    hero: {
      badge: 'أول دار رقمية للحيوانات الأليفة في المغرب',
      title: '١٠ سنوات من التقدّم.',
      subtitle: 'مصمَّمة لهم. مخصَّصة لك.',
      desc: 'دار راقية للكلاب والقطط في مراكش. حجز إلكتروني، تتبّع GPS، صور يومية، طبيب بيطري على مدار الساعة.',
      cta: 'احجز الآن', ctaAlt: 'اكتشف المزيد',
    },
    stats: {
      title: 'الثقة تُبنى. مرّةً تلو الأخرى.',
      a1: '١٠ سنوات', a2: 'من الخبرة',
      b1: '+٥٠٠', b2: 'عائلة وفية',
      c1: '٤٫٩ ★', c2: 'جوجل · ٣١٠ تقييم',
      d1: '٢٤/٧', d2: 'متابعة بيطرية',
      tag: 'لقد عادوا. مرّةً وأخرى.',
    },
    services: {
      eyebrow: 'ماذا نقدّم',
      title: 'عالم متكامل لهم.',
      sub: 'إيواء، نقل، تجميل، متجر — كلّ ذلك من أجل راحتهم.',
      items: [
        { icon: PawPrint, title: 'الإيواء', desc: 'إقامات راقية للكلاب والقطط، فضاءات واسعة، خرجات يومية.' },
        { icon: Car, title: 'بيت تاكسي', desc: 'نقل ٧ أيام في الأسبوع، تتبّع GPS مباشر، سائقون مدرَّبون.' },
        { icon: Scissors, title: 'التجميل', desc: 'استحمام، تمشيط، وقَصّ على يد متخصّصين.' },
        { icon: ShoppingBag, title: 'المتجر', desc: 'تغذية فاخرة وإكسسوارات مختارة.' },
      ],
    },
    why: {
      eyebrow: 'لماذا Dog Universe',
      title: 'المعيار الذي يستحقّه حيوانك.',
      items: [
        { icon: ShieldCheck, title: 'نظافة لا تُضاهى', desc: 'بروتوكولات بيطرية صارمة. تنظيف يومي. تحقّق من سجلّ التطعيمات.' },
        { icon: HeartHandshake, title: 'فريق مدرَّب', desc: 'فريقنا مؤهَّل في سلوك الحيوان والإسعافات الأولية.' },
        { icon: Clock3, title: 'متوفّر ٢٤/٧', desc: 'طبيب بيطري وفريق ليلي، طوال أيام السنة.' },
        { icon: MapPin, title: 'في قلب مراكش', desc: 'سهل الوصول من جيليز، الهيفرناج، والنخيل. بيت تاكسي مجاني داخل مراكش.' },
      ],
    },
    testimonials: {
      eyebrow: 'يثقون بنا',
      title: 'ماذا تقول عائلاتنا.',
      items: [
        { quote: 'مهدي وفريقه اعتنوا بتوبي كأنّه ملكهم. صور يومية، استلام مثالي. مرجع في مراكش.', name: 'صوفي ل.', meta: 'زبونة منذ ٢٠٢٢ · جيليز' },
        { quote: 'المكان الوحيد الذي أترك فيه قطّتيَّ بكلّ اطمئنان. مكان نظيف، استقبال شخصي، طبيب متاح. أحسنتم.', name: 'كريم ب.', meta: 'زبون منذ ٢٠٢٣ · الهيفرناج' },
        { quote: 'تتبّع GPS لبيت تاكسي غيّر حياتي. أرى بالضبط متى يصل كلبي. خدمة عالمية.', name: 'ليى م.', meta: 'زبونة منذ ٢٠٢٤ · النخيل' },
      ],
    },
    faq: {
      eyebrow: 'أسئلة شائعة',
      title: 'كلّ ما تحتاج معرفته.',
      items: [
        { q: 'ما هي تعريفة الإيواء؟', a: 'ابتداءً من ٧٠ درهم/ليلة للقطّ، و١٢٠ درهم/ليلة للكلب. تتغيّر حسب المدّة والخدمات الإضافية. أسعار شفّافة بدون رسوم خفيّة.' },
        { q: 'هل سيكون حيواني في أمان؟', a: 'فريقنا حاضر ٢٤/٧. التطعيمات تُتحقَّق عند الدخول. طبيب بيطري متاح. مساحات منفصلة للكلاب والقطط.' },
        { q: 'هل سأتلقّى أخبارًا أثناء الإقامة؟', a: 'نعم. صور يومية في حسابك. يمكنك التواصل معنا في أيّ وقت عبر الرسائل أو واتساب.' },
        { q: 'هل بيت تاكسي متاح فعلاً ٧/٧؟', a: 'نعم، من ١٠ صباحًا إلى ٥ مساءً (مع فترات مختارة يوم الأحد). تتبّع GPS مباشر من حسابك.' },
        { q: 'كيف أحجز؟', a: 'أنشئ حسابك في ٣٠ ثانية، ثمّ احجز بنقرات قليلة. ادفع عند الوصول أو إلكترونيًا. إلغاء مجاني حتى ٢٤ ساعة قبل الموعد.' },
      ],
    },
    final: {
      title: 'مستعدّون لمنحهم العالم؟',
      sub: 'احجز في بضع دقائق. مرحبًا بك في العائلة.',
      cta: 'احجز الآن', whatsapp: 'أو تواصل معنا عبر واتساب',
    },
    footer: {
      copy: '© ٢٠٢٦ Dog Universe — مراكش، المغرب',
      tag: 'إيواء · بيت تاكسي · تجميل · متجر',
      privacy: 'الخصوصية', terms: 'الشروط',
    },
  };
}

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
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: #9a7b2e;
  display: block;
}
.du-italic {
  font-family: var(--font-cormorant), serif;
  font-style: italic;
  font-weight: 300;
  margin: 0;
  line-height: 1.15;
}
.du-rtl .du-italic { font-family: var(--font-arabic), serif; font-style: normal; font-weight: 400; }
.du-gold-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: #9a7b2e; color: #0f0d0a;
  font-family: var(--font-dmsans), sans-serif;
  font-weight: 500; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
  padding: 14px 32px; border-radius: 3px; text-decoration: none;
  transition: background 0.15s, transform 0.15s;
}
.du-rtl .du-gold-btn { font-family: var(--font-arabic), sans-serif; letter-spacing: 0; text-transform: none; font-size: 13px; }
.du-gold-btn:hover { background: #7d6424; transform: translateY(-1px); }
.du-ghost-btn {
  display: inline-flex; align-items: center; gap: 6px;
  color: #f5edd8; text-decoration: none;
  font-family: var(--font-dmsans), sans-serif;
  font-size: 12px; letter-spacing: 0.1em;
  padding: 14px 24px; border: 0.5px solid rgba(245,237,216,0.25);
  border-radius: 3px;
  transition: border-color 0.15s, color 0.15s;
}
.du-ghost-btn:hover { border-color: #9a7b2e; color: #9a7b2e; }

/* ─── Nav ──────────────────────────────────────────────────────────── */
.du-nav { background: #0f0d0a; border-bottom: 1px solid rgba(154,123,46,0.18); position: sticky; top: 0; z-index: 50; backdrop-filter: blur(8px); }
.du-nav-inner { max-width: 1240px; margin: 0 auto; padding: 0 32px; height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.du-nav-logo {
  font-family: var(--font-cormorant), serif; font-style: italic; font-weight: 400;
  font-size: 22px; color: #9a7b2e; letter-spacing: 0.04em; text-decoration: none;
  white-space: nowrap;
}
.du-rtl .du-nav-logo { font-family: var(--font-arabic), serif; font-style: normal; font-weight: 700; }
.du-nav-actions { display: flex; align-items: center; gap: 10px; }
.du-langs { display: flex; gap: 4px; margin-right: 12px; }
.du-rtl .du-langs { margin-right: 0; margin-left: 12px; }
.du-lang {
  font-family: var(--font-dmsans), sans-serif;
  font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
  color: rgba(245,237,216,0.5); padding: 6px 8px; text-decoration: none;
  transition: color 0.15s;
}
.du-lang:hover { color: #9a7b2e; }
.du-lang.is-active { color: #9a7b2e; border-bottom: 0.5px solid #9a7b2e; }
.du-nav-link {
  font-family: var(--font-dmsans), sans-serif;
  font-weight: 400; font-size: 12px; color: #f5edd8;
  letter-spacing: 0.05em; padding: 10px 18px;
  border: 0.5px solid rgba(154,123,46,0.4); border-radius: 3px;
  text-decoration: none; transition: color 0.15s, border-color 0.15s;
}
.du-nav-link:hover { color: #9a7b2e; border-color: #9a7b2e; }
.du-nav-cta {
  background: #9a7b2e; color: #0f0d0a;
  font-family: var(--font-dmsans), sans-serif;
  font-weight: 500; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
  padding: 11px 22px; border-radius: 3px; text-decoration: none;
  transition: background 0.15s;
}
.du-rtl .du-nav-cta { font-family: var(--font-arabic), sans-serif; letter-spacing: 0; text-transform: none; font-size: 13px; }
.du-nav-cta:hover { background: #7d6424; }

/* ─── Hero ─────────────────────────────────────────────────────────── */
.du-hero {
  background:
    radial-gradient(ellipse 80% 60% at 50% 0%, rgba(154,123,46,0.12), transparent 70%),
    radial-gradient(ellipse 60% 40% at 50% 100%, rgba(154,123,46,0.08), transparent 60%),
    #0f0d0a;
  padding: 120px 32px 100px;
  position: relative;
  overflow: hidden;
}
.du-hero-inner { max-width: 960px; margin: 0 auto; text-align: center; position: relative; z-index: 1; }
.du-hero-badge {
  display: inline-block;
  font-family: var(--font-dmsans), sans-serif;
  font-weight: 500; font-size: 10px;
  text-transform: uppercase; letter-spacing: 0.2em; color: #9a7b2e;
  background: rgba(154,123,46,0.10); border: 0.5px solid rgba(154,123,46,0.4);
  border-radius: 999px; padding: 8px 18px; margin-bottom: 40px;
}
.du-rtl .du-hero-badge { font-family: var(--font-arabic), sans-serif; letter-spacing: 0; text-transform: none; font-size: 12px; }
.du-hero-title { font-size: 84px; color: #f5edd8; letter-spacing: -0.01em; }
.du-hero-sub { font-size: 22px; color: rgba(201,168,76,0.78); margin-top: 18px; }
.du-hero-desc {
  font-family: var(--font-dmsans), sans-serif;
  font-weight: 300; font-size: 15px; line-height: 1.7;
  color: rgba(245,237,216,0.7);
  max-width: 560px; margin: 28px auto 44px;
}
.du-rtl .du-hero-desc { font-family: var(--font-arabic), sans-serif; font-size: 16px; }
.du-hero-ctas { display: inline-flex; gap: 12px; flex-wrap: wrap; justify-content: center; }

/* ─── Stats ────────────────────────────────────────────────────────── */
.du-stats {
  background: #ffffff;
  border-top: 0.5px solid rgba(154,123,46,0.18);
  border-bottom: 0.5px solid rgba(154,123,46,0.18);
  padding: 72px 32px;
}
.du-stats-inner { max-width: 1100px; margin: 0 auto; }
.du-stats-head { text-align: center; margin-bottom: 48px; }
.du-stats-head-title { font-size: 28px; color: #0f0d0a; }
.du-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); text-align: center; }
.du-stat { padding: 8px 0; }
.du-stat + .du-stat { border-left: 0.5px solid rgba(154,123,46,0.18); }
.du-rtl .du-stat + .du-stat { border-left: none; border-right: 0.5px solid rgba(154,123,46,0.18); }
.du-stat-big { font-size: 40px; color: #0f0d0a; }
.du-stat-small { margin-top: 10px; }
.du-stats-tag {
  font-size: 18px; color: rgba(154,123,46,0.85);
  text-align: center; margin-top: 48px;
}

/* ─── Services ─────────────────────────────────────────────────────── */
.du-services { background: #f5efe3; padding: 112px 32px; }
.du-services-inner { max-width: 1100px; margin: 0 auto; }
.du-services-head { text-align: center; margin-bottom: 64px; }
.du-services-title { font-size: 46px; color: #0f0d0a; margin-top: 14px; }
.du-services-sub {
  font-family: var(--font-dmsans), sans-serif;
  font-weight: 300; font-size: 14px; color: rgba(15,13,10,0.65);
  margin-top: 12px;
}
.du-rtl .du-services-sub { font-family: var(--font-arabic), sans-serif; font-size: 15px; }
.du-services-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
.du-card {
  background: #ffffff; border: 0.5px solid rgba(154,123,46,0.18); border-radius: 3px;
  overflow: hidden; transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
  display: flex; flex-direction: column;
}
.du-card:hover { transform: translateY(-3px); box-shadow: 0 12px 28px rgba(15,13,10,0.08); border-color: rgba(154,123,46,0.35); }
.du-card-photo {
  height: 140px;
  background: linear-gradient(135deg, #1a1612 0%, #2a1f15 60%, #3a2d1c 100%);
  display: flex; align-items: center; justify-content: center;
}
.du-card-photo-icon { width: 40px; height: 40px; color: rgba(201,168,76,0.6); }
.du-card-body { padding: 22px 20px 24px; }
.du-card-title { font-size: 22px; color: #0f0d0a; margin-bottom: 10px; }
.du-card-desc {
  font-family: var(--font-dmsans), sans-serif;
  font-weight: 300; font-size: 12px; line-height: 1.65;
  color: rgba(15,13,10,0.65); margin: 0;
}
.du-rtl .du-card-desc { font-family: var(--font-arabic), sans-serif; font-size: 13px; }

/* ─── Why ──────────────────────────────────────────────────────────── */
.du-why { background: #ffffff; padding: 112px 32px; border-top: 0.5px solid rgba(154,123,46,0.10); }
.du-why-inner { max-width: 1100px; margin: 0 auto; }
.du-why-head { text-align: center; margin-bottom: 64px; }
.du-why-title { font-size: 42px; color: #0f0d0a; margin-top: 14px; }
.du-why-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 32px; }
.du-why-item { text-align: center; padding: 0 8px; }
.du-why-icon-wrap {
  width: 56px; height: 56px; margin: 0 auto 20px;
  border-radius: 50%; background: rgba(154,123,46,0.08); border: 0.5px solid rgba(154,123,46,0.3);
  display: flex; align-items: center; justify-content: center;
}
.du-why-icon { width: 24px; height: 24px; color: #9a7b2e; }
.du-why-item-title { font-family: var(--font-cormorant), serif; font-style: italic; font-weight: 400; font-size: 22px; color: #0f0d0a; margin-bottom: 12px; }
.du-rtl .du-why-item-title { font-family: var(--font-arabic), serif; font-style: normal; font-weight: 500; }
.du-why-item-desc {
  font-family: var(--font-dmsans), sans-serif;
  font-weight: 300; font-size: 13px; line-height: 1.7;
  color: rgba(15,13,10,0.65);
}
.du-rtl .du-why-item-desc { font-family: var(--font-arabic), sans-serif; font-size: 14px; }

/* ─── Testimonials ─────────────────────────────────────────────────── */
.du-testi { background: #f5efe3; padding: 112px 32px; }
.du-testi-inner { max-width: 1100px; margin: 0 auto; }
.du-testi-head { text-align: center; margin-bottom: 56px; }
.du-testi-title { font-size: 42px; color: #0f0d0a; margin-top: 14px; }
.du-testi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.du-testi-card {
  background: #ffffff; border: 0.5px solid rgba(154,123,46,0.18); border-radius: 3px;
  padding: 32px 28px; display: flex; flex-direction: column;
}
.du-testi-stars { display: flex; gap: 2px; margin-bottom: 18px; }
.du-testi-star { width: 14px; height: 14px; color: #9a7b2e; fill: #9a7b2e; }
.du-testi-quote {
  font-family: var(--font-cormorant), serif; font-style: italic; font-weight: 400;
  font-size: 17px; line-height: 1.55; color: #2c2315;
  flex: 1; margin: 0 0 20px;
}
.du-rtl .du-testi-quote { font-family: var(--font-arabic), serif; font-style: normal; font-size: 16px; line-height: 1.8; }
.du-testi-name {
  font-family: var(--font-dmsans), sans-serif;
  font-weight: 500; font-size: 12px; color: #0f0d0a; letter-spacing: 0.04em;
}
.du-rtl .du-testi-name { font-family: var(--font-arabic), sans-serif; }
.du-testi-meta {
  font-family: var(--font-dmsans), sans-serif;
  font-weight: 300; font-size: 11px; color: rgba(15,13,10,0.5); margin-top: 4px;
}
.du-rtl .du-testi-meta { font-family: var(--font-arabic), sans-serif; font-size: 12px; }

/* ─── FAQ ──────────────────────────────────────────────────────────── */
.du-faq { background: #ffffff; padding: 112px 32px; border-top: 0.5px solid rgba(154,123,46,0.10); }
.du-faq-inner { max-width: 820px; margin: 0 auto; }
.du-faq-head { text-align: center; margin-bottom: 56px; }
.du-faq-title { font-size: 42px; color: #0f0d0a; margin-top: 14px; }
.du-faq-list { display: flex; flex-direction: column; gap: 12px; }
.du-faq-item {
  background: #faf6ec;
  border: 0.5px solid rgba(154,123,46,0.18); border-radius: 3px;
  overflow: hidden;
}
.du-faq-summary {
  list-style: none; cursor: pointer;
  padding: 22px 24px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  font-family: var(--font-cormorant), serif; font-style: italic; font-weight: 400;
  font-size: 19px; color: #0f0d0a;
}
.du-rtl .du-faq-summary { font-family: var(--font-arabic), serif; font-style: normal; font-size: 17px; font-weight: 500; }
.du-faq-summary::-webkit-details-marker { display: none; }
.du-faq-summary::after {
  content: '+'; font-family: var(--font-dmsans), sans-serif; font-weight: 300;
  font-size: 24px; color: #9a7b2e; transition: transform 0.2s;
}
.du-faq-item[open] .du-faq-summary::after { content: '−'; }
.du-faq-answer {
  padding: 0 24px 22px;
  font-family: var(--font-dmsans), sans-serif;
  font-weight: 300; font-size: 14px; line-height: 1.7; color: rgba(15,13,10,0.7);
}
.du-rtl .du-faq-answer { font-family: var(--font-arabic), sans-serif; font-size: 15px; line-height: 1.9; }

/* ─── CTA final ────────────────────────────────────────────────────── */
.du-final {
  background:
    radial-gradient(ellipse 60% 60% at 50% 50%, rgba(154,123,46,0.10), transparent 70%),
    #0f0d0a;
  padding: 96px 32px; text-align: center;
}
.du-final-title { font-size: 48px; color: #f5edd8; }
.du-final-sub { font-size: 18px; color: rgba(201,168,76,0.7); margin-top: 16px; margin-bottom: 40px; }
.du-final-whatsapp {
  display: inline-flex; align-items: center; gap: 8px;
  margin-top: 20px; color: rgba(245,237,216,0.55);
  font-family: var(--font-dmsans), sans-serif; font-size: 12px; text-decoration: none;
  letter-spacing: 0.05em;
  transition: color 0.15s;
}
.du-rtl .du-final-whatsapp { font-family: var(--font-arabic), sans-serif; font-size: 13px; }
.du-final-whatsapp:hover { color: #9a7b2e; }

/* ─── Footer ───────────────────────────────────────────────────────── */
.du-footer { background: #0f0d0a; padding: 40px 0 32px; border-top: 1px solid rgba(154,123,46,0.18); }
.du-footer-inner {
  max-width: 1240px; margin: 0 auto; padding: 0 32px;
  display: flex; flex-wrap: wrap; gap: 16px;
  align-items: center; justify-content: space-between;
  font-family: var(--font-dmsans), sans-serif; font-size: 12px;
  color: rgba(245,237,216,0.3);
}
.du-rtl .du-footer-inner { font-family: var(--font-arabic), sans-serif; }
.du-footer-left { display: flex; flex-direction: column; gap: 4px; }
.du-footer-tag { color: rgba(245,237,216,0.45); font-size: 11px; letter-spacing: 0.08em; }
.du-footer-links { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.du-footer-link { color: rgba(245,237,216,0.4); text-decoration: none; transition: color 0.15s; }
.du-footer-link:hover { color: #9a7b2e; }
.du-footer-sep { color: rgba(245,237,216,0.2); }

/* ─── Responsive ───────────────────────────────────────────────────── */
@media (max-width: 900px) {
  .du-services-grid, .du-why-grid { grid-template-columns: repeat(2, 1fr); }
  .du-testi-grid { grid-template-columns: 1fr; }
  .du-stats-grid { grid-template-columns: repeat(2, 1fr); gap: 32px 0; }
  .du-stat + .du-stat { border-left: none; }
  .du-stat:nth-child(odd) { border-right: 0.5px solid rgba(154,123,46,0.18); }
  .du-rtl .du-stat:nth-child(odd) { border-right: none; border-left: 0.5px solid rgba(154,123,46,0.18); }
}
@media (max-width: 640px) {
  .du-nav-inner { padding: 0 20px; height: 64px; }
  .du-nav-logo { font-size: 18px; }
  .du-nav-link { display: none; }
  .du-hero { padding: 80px 20px 64px; }
  .du-hero-title { font-size: 48px; }
  .du-hero-sub { font-size: 18px; }
  .du-hero-desc { font-size: 14px; }
  .du-stats { padding: 56px 20px; }
  .du-stat-big { font-size: 30px; }
  .du-services, .du-why, .du-testi, .du-faq { padding: 72px 20px; }
  .du-services-title, .du-why-title, .du-testi-title, .du-faq-title { font-size: 30px; }
  .du-services-grid, .du-why-grid { grid-template-columns: 1fr; gap: 16px; }
  .du-final { padding: 72px 20px; }
  .du-final-title { font-size: 32px; }
  .du-footer-inner { flex-direction: column; text-align: center; }
}
`;

export default async function LandingPage({ locale }: LandingPageProps) {
  const safeLocale: Locale = (['fr', 'en', 'ar'] as const).includes(locale as Locale)
    ? (locale as Locale)
    : 'fr';
  const isRtl = safeLocale === 'ar';
  const t = COPY[safeLocale];

  // CSP nonce from middleware (src/middleware/i18n.ts:x-nonce header)
  const nonce = (await headers()).get('x-nonce') ?? '';

  const rootClass = [
    'du-root',
    cormorant.variable,
    dmSans.variable,
    notoArabic.variable,
    isRtl ? 'du-rtl' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // ── JSON-LD : LocalBusiness + Service + FAQPage + AggregateRating ──
  // All structured data in one @graph for cleanliness. Google parses any
  // valid combination.
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
        telephone: '+212-XXX-XXXXXX',
        email: 'contact@doguniverse.ma',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Marrakech',
          addressRegion: 'Marrakech-Safi',
          addressCountry: 'MA',
        },
        areaServed: { '@type': 'City', name: 'Marrakech' },
        openingHoursSpecification: [
          { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: '00:00', closes: '23:59' },
        ],
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.9',
          reviewCount: '310',
          bestRating: '5',
          worstRating: '1',
        },
        sameAs: [
          'https://www.facebook.com/doguniverse.ma',
          'https://www.instagram.com/doguniverse.ma',
        ],
      },
      {
        '@type': 'Service',
        serviceType: 'Pet Boarding',
        provider: { '@id': `${baseUrl}/#organization` },
        areaServed: 'Marrakech',
        offers: { '@type': 'Offer', priceCurrency: 'MAD', price: '70', description: 'À partir de 70 MAD/nuit (chat) ou 120 MAD/nuit (chien)' },
      },
      {
        '@type': 'Service',
        serviceType: 'Pet Taxi',
        provider: { '@id': `${baseUrl}/#organization` },
        areaServed: 'Marrakech',
        offers: { '@type': 'Offer', priceCurrency: 'MAD', price: '150' },
      },
      {
        '@type': 'FAQPage',
        mainEntity: t.faq.items.map((it) => ({
          '@type': 'Question',
          name: it.q,
          acceptedAnswer: { '@type': 'Answer', text: it.a },
        })),
      },
    ],
  };

  return (
    <div className={rootClass}>
      <style nonce={nonce}>{LANDING_CSS}</style>
      <script
        type="application/ld+json"
        nonce={nonce}
        // Server-rendered, static JSON, safe — schema.org structured data.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }}
      />

      {/* ─── Nav ───────────────────────────────────────────────────────── */}
      <nav className="du-nav" aria-label="Primary">
        <div className="du-nav-inner">
          <Link href={`/${safeLocale}`} className="du-nav-logo" aria-label="Dog Universe — accueil">
            Dog Universe
          </Link>
          <div className="du-nav-actions">
            <div className="du-langs" role="group" aria-label={t.nav.langLabel}>
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
            <Link href={`/${safeLocale}/auth/login`} className="du-nav-link">
              {t.nav.space}
            </Link>
            <Link href={`/${safeLocale}/auth/register`} className="du-nav-cta">
              {t.nav.book}
            </Link>
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
            <p className="du-hero-desc">{t.hero.desc}</p>
            <div className="du-hero-ctas">
              <Link href={`/${safeLocale}/auth/register`} className="du-gold-btn">{t.hero.cta}</Link>
              <Link href="#services" className="du-ghost-btn">{t.hero.ctaAlt}</Link>
            </div>
          </div>
        </section>

        {/* ─── Stats ────────────────────────────────────────────────────── */}
        <section className="du-stats" aria-label="Statistiques de confiance">
          <div className="du-stats-inner">
            <div className="du-stats-head">
              <h2 className="du-italic du-stats-head-title">{t.stats.title}</h2>
            </div>
            <div className="du-stats-grid">
              {[
                { big: t.stats.a1, small: t.stats.a2 },
                { big: t.stats.b1, small: t.stats.b2 },
                { big: t.stats.c1, small: t.stats.c2 },
                { big: t.stats.d1, small: t.stats.d2 },
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
              <p className="du-services-sub">{t.services.sub}</p>
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

        {/* ─── Why ──────────────────────────────────────────────────────── */}
        <section className="du-why" aria-labelledby="why-title">
          <div className="du-why-inner">
            <div className="du-why-head">
              <div className="du-eyebrow">{t.why.eyebrow}</div>
              <h2 id="why-title" className="du-italic du-why-title">{t.why.title}</h2>
            </div>
            <div className="du-why-grid">
              {t.why.items.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="du-why-item">
                    <div className="du-why-icon-wrap"><Icon className="du-why-icon" aria-hidden /></div>
                    <h3 className="du-why-item-title">{item.title}</h3>
                    <p className="du-why-item-desc">{item.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── Testimonials ─────────────────────────────────────────────── */}
        <section className="du-testi" aria-labelledby="testi-title">
          <div className="du-testi-inner">
            <div className="du-testi-head">
              <div className="du-eyebrow">{t.testimonials.eyebrow}</div>
              <h2 id="testi-title" className="du-italic du-testi-title">{t.testimonials.title}</h2>
            </div>
            <div className="du-testi-grid">
              {t.testimonials.items.map((testi) => (
                <blockquote key={testi.name} className="du-testi-card">
                  <div className="du-testi-stars" aria-label="5 sur 5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star key={i} className="du-testi-star" aria-hidden />
                    ))}
                  </div>
                  <p className="du-testi-quote">“{testi.quote}”</p>
                  <footer>
                    <div className="du-testi-name">{testi.name}</div>
                    <div className="du-testi-meta">{testi.meta}</div>
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FAQ ──────────────────────────────────────────────────────── */}
        <section className="du-faq" aria-labelledby="faq-title">
          <div className="du-faq-inner">
            <div className="du-faq-head">
              <div className="du-eyebrow">{t.faq.eyebrow}</div>
              <h2 id="faq-title" className="du-italic du-faq-title">{t.faq.title}</h2>
            </div>
            <div className="du-faq-list">
              {t.faq.items.map((item, i) => (
                <details key={i} className="du-faq-item">
                  <summary className="du-faq-summary">{item.q}</summary>
                  <div className="du-faq-answer">{item.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ─── CTA final ────────────────────────────────────────────────── */}
        <section className="du-final" aria-labelledby="final-title">
          <h2 id="final-title" className="du-italic du-final-title">{t.final.title}</h2>
          <p className="du-italic du-final-sub">{t.final.sub}</p>
          <Link href={`/${safeLocale}/auth/register`} className="du-gold-btn">{t.final.cta}</Link>
          <div>
            <a
              href="https://wa.me/212600000000"
              target="_blank"
              rel="noopener noreferrer"
              className="du-final-whatsapp"
            >
              <MessageCircle width={14} height={14} aria-hidden /> {t.final.whatsapp}
            </a>
          </div>
        </section>
      </main>

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <footer className="du-footer">
        <div className="du-footer-inner">
          <div className="du-footer-left">
            <span>{t.footer.copy}</span>
            <span className="du-footer-tag">{t.footer.tag}</span>
          </div>
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
