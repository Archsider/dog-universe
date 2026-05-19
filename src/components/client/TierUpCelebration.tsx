'use client';

// Tier-up Celebration Modal — fires confetti + a full-screen banner when
// the client's loyalty grade has just been upgraded.  Triggered by an
// unread LOYALTY_UPDATE notification ; uses localStorage to ensure each
// promotion only celebrates once even if the user revisits the dashboard.
//
// Source : Wave 5 (UX classe mondiale, Feature #2).

import { useEffect, useState } from 'react';
import { Crown, Sparkles, X } from 'lucide-react';
import type { Grade } from '@/lib/loyalty';

interface Props {
  grade: Grade;
  locale: string;
  /** Most-recent loyalty notification, if any.  Used as the trigger. */
  lastLoyaltyNotification: {
    id: string;
    createdAt: string;
    read: boolean;
  } | null;
}

const TIER_STYLE: Record<Grade, { gradient: string; accent: string; label: { fr: string; en: string; ar: string } }> = {
  BRONZE:   { gradient: 'from-[#B5793D] via-[#8A5A2C] to-[#5C3D1C]', accent: '#E0A865', label: { fr: 'BRONZE', en: 'BRONZE', ar: 'برونزي' } },
  SILVER:   { gradient: 'from-[#A8A8B8] via-[#7E7E8F] to-[#5C5C6E]', accent: '#D8D8E5', label: { fr: 'SILVER', en: 'SILVER', ar: 'فضي' } },
  GOLD:     { gradient: 'from-[#D4AF37] via-[#A8841C] to-[#6B5212]', accent: '#FFE082', label: { fr: 'GOLD',   en: 'GOLD',   ar: 'ذهبي' } },
  PLATINUM: { gradient: 'from-[#1E1E36] via-[#0E0E1F] to-[#000000]', accent: '#D4AF37', label: { fr: 'PLATINUM', en: 'PLATINUM', ar: 'بلاتيني' } },
};

const BENEFITS: Record<Grade, { fr: string; en: string }[]> = {
  BRONZE: [
    { fr: 'Bienvenue dans le club Dog Universe', en: 'Welcome to the Dog Universe club' },
  ],
  SILVER: [
    { fr: 'Priorité de réservation', en: 'Booking priority' },
    { fr: 'Surprise d\'anniversaire', en: 'Birthday surprise' },
  ],
  GOLD: [
    { fr: 'Toilettage offert annuel', en: 'Annual grooming included' },
    { fr: 'Late checkout offert', en: 'Free late checkout' },
  ],
  PLATINUM: [
    { fr: 'Concierge dédié', en: 'Dedicated concierge' },
    { fr: 'Pet Taxi prioritaire', en: 'Priority Pet Taxi' },
    { fr: 'Évènements VIP exclusifs', en: 'Exclusive VIP events' },
  ],
};

function celebrationKey(grade: Grade, notifId: string): string {
  return `tierup:celebrated:${grade}:${notifId}`;
}

export default function TierUpCelebration({ grade, locale, lastLoyaltyNotification }: Props) {
  const fr = locale === 'fr';
  const ar = locale === 'ar';
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!lastLoyaltyNotification) return;
    // Only fire on UNREAD notifications < 7 days old, and only once per
    // (grade, notification) — localStorage flag.
    const ageMs = Date.now() - new Date(lastLoyaltyNotification.createdAt).getTime();
    if (lastLoyaltyNotification.read || ageMs > 7 * 86_400_000) return;
    try {
      if (localStorage.getItem(celebrationKey(grade, lastLoyaltyNotification.id))) return;
    } catch { /* ignore */ }
    // Tiny delay so the page lands before the modal pops.
    const t = setTimeout(() => setShow(true), 600);
    return () => clearTimeout(t);
  }, [grade, lastLoyaltyNotification]);

  function dismiss() {
    if (lastLoyaltyNotification) {
      try { localStorage.setItem(celebrationKey(grade, lastLoyaltyNotification.id), '1'); } catch { /* ignore */ }
    }
    setShow(false);
  }

  if (!show) return null;

  const style = TIER_STYLE[grade];
  const label = ar ? style.label.ar : fr ? style.label.fr : style.label.en;
  const benefits = BENEFITS[grade];

  return (
    <div
      role="dialog"
      aria-labelledby="tierup-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={dismiss}
    >
      {/* Confetti — cheap inline SVG sprite, no lib needed. */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden
      >
        {Array.from({ length: 24 }).map((_, i) => (
          <circle
            key={i}
            cx={`${(i * 37) % 100}%`}
            cy={`${(i * 53) % 100}%`}
            r={2 + (i % 3)}
            fill={i % 2 === 0 ? style.accent : '#fff'}
            style={{
              animation: `tierup-confetti 3s ease-out ${i * 0.1}s forwards`,
              opacity: 0,
            }}
          />
        ))}
      </svg>

      <style jsx>{`
        @keyframes tierup-confetti {
          0%   { opacity: 0; transform: translateY(-80px) scale(0); }
          20%  { opacity: 1; }
          100% { opacity: 0; transform: translateY(200px) scale(1.4) rotate(180deg); }
        }
      `}</style>

      <div
        className={`relative max-w-sm w-full rounded-3xl bg-gradient-to-br ${style.gradient} p-8 text-center shadow-2xl animate-in zoom-in-95 duration-300`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label={fr ? 'Fermer' : 'Close'}
          className="absolute top-3 right-3 text-white/40 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex justify-center mb-4">
          <div className="relative">
            <Crown className="h-14 w-14 text-white drop-shadow-lg" />
            <Sparkles className="absolute -top-1 -right-2 h-5 w-5 text-yellow-200 animate-pulse" />
          </div>
        </div>

        <p className="text-xs uppercase tracking-[3px] text-white/70">
          {fr ? 'Nouveau statut' : ar ? 'حالة جديدة' : 'New status'}
        </p>
        <h2 id="tierup-title" className="text-4xl font-serif font-bold text-white mt-2 tracking-wider">
          {label}
        </h2>
        <p className="text-sm text-white/80 mt-2 italic">
          {fr
            ? 'Félicitations, votre fidélité est récompensée.'
            : ar ? 'تهانينا، ولاؤك يكافأ.' : 'Congratulations, your loyalty is rewarded.'}
        </p>

        <div className="mt-6 space-y-2 text-left">
          <p className="text-[10px] uppercase tracking-[2px] text-white/60 text-center mb-2">
            {fr ? 'Avantages débloqués' : ar ? 'الفوائد المفتوحة' : 'Benefits unlocked'}
          </p>
          {benefits.map((b, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-white/90">
              <span style={{ color: style.accent }}>✦</span>
              <span>{fr ? b.fr : b.en}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="mt-7 w-full px-6 py-3 rounded-full bg-white/15 hover:bg-white/25 text-white font-medium text-sm transition-colors border border-white/20"
        >
          {fr ? 'Merci ! 🐾' : ar ? 'شكراً! 🐾' : 'Thank you! 🐾'}
        </button>
      </div>
    </div>
  );
}
