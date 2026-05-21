// Luxe greeting header — large salutation, gold-bordered subtitle card,
// optional countdown progress bar (J-14 → J-0).
//
// Design intent : a concierge intro that earns its space at the top of the
// dashboard.  Italic gold salutation, dominant serif name, gold-rule,
// status pill, and — when a stay is imminent — a horizontal countdown
// timeline with milestone markers.
//
// Source : Wave 5 polish round 2 (user feedback : 'plus classe mondiale',
// 'rajouter une barre interactive').

import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  salutation: string;
  /** Display name (first + optional last italic). */
  firstName: string;
  lastName?: string | null;
  /** Contextual single-line subtitle (already locale-aware). May be plain
   *  text or interactive nodes (e.g. the in-pension popover trigger). */
  subtitle: ReactNode;
  /** Tweak the dark mode of the band — admin uses dark, client uses light. */
  variant?: 'light' | 'dark';
  align?: 'left' | 'center';
  /**
   * When provided, renders a horizontal countdown bar.
   * `days` = J-X (0 = today, 7 = J-7 ; values > 14 hide the bar).
   */
  countdown?: {
    days: number;
    petName?: string | null;
    locale: string;
  };
}

const COUNTDOWN_HORIZON = 14;

export default function GreetingHeader({
  salutation, firstName, lastName, subtitle,
  variant = 'light',
  align = 'left',
  countdown,
}: Props) {
  const isDark = variant === 'dark';

  // Progress 0..1 — full at day 0, empty at day 14+.
  const showBar = countdown && countdown.days <= COUNTDOWN_HORIZON;
  const progress = countdown
    ? Math.max(0, Math.min(1, 1 - countdown.days / COUNTDOWN_HORIZON))
    : 0;

  return (
    <div className={`${align === 'center' ? 'text-center' : 'text-center sm:text-left'} space-y-3`}>
      {/* Salutation — italic serif gold, big. */}
      <p
        className={`font-serif italic text-2xl sm:text-3xl tracking-tight ${
          isDark ? 'text-[#D4AF37]' : 'text-[#C4974A]'
        }`}
      >
        {salutation},
      </p>

      {/* Name — biggest. */}
      <h1
        className={`font-serif text-5xl sm:text-6xl font-bold leading-[1.05] tracking-tight ${
          isDark ? 'text-[#F5EDD8]' : 'text-[#1C1612]'
        }`}
      >
        {firstName}
        {lastName && (
          <>
            {' '}
            <span className={`italic font-normal ${
              isDark ? 'text-[#D4AF37]' : 'text-[#C4974A]'
            }`}>
              {lastName}
            </span>
          </>
        )}
      </h1>

      {/* Gold rule. */}
      <div
        className={`h-[2px] bg-gradient-to-r ${
          isDark
            ? 'from-transparent via-[#D4AF37] to-transparent'
            : 'from-transparent via-[#C4974A] to-transparent'
        } ${align === 'left' ? 'sm:mx-0 sm:max-w-[200px]' : 'mx-auto max-w-[200px]'}`}
      />

      {/* Subtitle pill. */}
      <div
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${
          isDark
            ? 'border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#F5EDD8]'
            : 'border-[#C4974A]/30 bg-[#FFF9E8] text-[#5C4A2C]'
        } shadow-sm`}
      >
        <Sparkles className={`h-3.5 w-3.5 ${isDark ? 'text-[#D4AF37]' : 'text-[#C4974A]'}`} />
        <span className="text-sm font-medium">{subtitle}</span>
      </div>

      {/* Countdown bar — visible from J-14 to J-0.  Fills toward arrival.
          Inspired by luxe travel apps : the closer the date, the brighter
          the gold gradient lights up across the bar. */}
      {showBar && (
        <CountdownBar
          days={countdown!.days}
          progress={progress}
          isDark={isDark}
          locale={countdown!.locale}
          petName={countdown!.petName ?? null}
        />
      )}
    </div>
  );
}

function CountdownBar({
  days, progress, isDark, locale, petName,
}: {
  days: number;
  progress: number;
  isDark: boolean;
  locale: string;
  petName: string | null;
}) {
  const fr = locale === 'fr';
  const ar = locale === 'ar';

  // Milestone markers : J-14 / J-7 / J-3 / J-1 / J-0.
  const milestones = [14, 7, 3, 1, 0];
  const labelForDays = (d: number): string => {
    if (d === 0) return fr ? 'Jour J' : ar ? 'اليوم' : 'Day 0';
    return `J-${d}`;
  };

  const headline = days === 0
    ? (fr ? `${petName ?? 'Votre compagnon'} est attendu aujourd'hui` : `${petName ?? 'Your companion'} is expected today`)
    : days === 1
      ? (fr ? `${petName ?? 'Arrivée'} demain` : `${petName ?? 'Arrival'} tomorrow`)
      : (fr ? `J-${days} jusqu'à l'arrivée` : `T-${days} until arrival`);

  return (
    <div className="mt-4 w-full max-w-md mx-auto sm:mx-0">
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] uppercase tracking-[2px] font-semibold ${
          isDark ? 'text-[#D4AF37]/80' : 'text-[#8B6914]'
        }`}>
          {headline}
        </span>
      </div>

      {/* Bar */}
      <div className="relative h-3">
        {/* track */}
        <div className={`absolute inset-0 rounded-full ${
          isDark ? 'bg-white/5 border border-[#D4AF37]/20' : 'bg-[#C4974A]/10 border border-[#C4974A]/20'
        }`} />
        {/* fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#8B6914] via-[#D4AF37] to-[#FFE082] shadow-[0_0_10px_rgba(212,175,55,0.4)] transition-[width] duration-500"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
        {/* milestones */}
        {milestones.map((m) => {
          const left = (1 - m / 14) * 100;
          const reached = days <= m;
          return (
            <div
              key={m}
              className={`absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${
                reached
                  ? 'bg-[#FFE082] shadow-[0_0_4px_#D4AF37]'
                  : isDark ? 'bg-white/30' : 'bg-[#C4974A]/30'
              }`}
              style={{ left: `${left}%` }}
              title={labelForDays(m)}
            />
          );
        })}
      </div>

      {/* axis labels */}
      <div className="flex justify-between mt-1.5 text-[9px] uppercase tracking-wider">
        {milestones.map((m) => (
          <span
            key={m}
            className={`${
              days <= m
                ? isDark ? 'text-[#D4AF37] font-semibold' : 'text-[#8B6914] font-semibold'
                : isDark ? 'text-[#F5EDD8]/40' : 'text-[#C4974A]/50'
            }`}
          >
            {labelForDays(m)}
          </span>
        ))}
      </div>
    </div>
  );
}
