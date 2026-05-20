'use client';

// Countdown Hero — banner shown above a CONFIRMED booking from J-7 onwards.
// Displays a live "J-X" countdown that ticks down every minute, plus a
// "Mood Builder" with 3 toggle chips for jouet préféré / friandise spéciale
// / musique d'ambiance.  Selections persist locally (localStorage) so the
// client builds the rituel d'anticipation.
//
// Source : Wave 5 audit (UX classe mondiale, Feature #1).

import { useEffect, useState } from 'react';
import { Heart, Music2, Gift, Sparkles } from 'lucide-react';

interface Props {
  bookingId: string;
  startDate: string; // ISO
  petName: string | null;
  locale: string;
}

interface MoodState {
  toy: boolean;
  treat: boolean;
  music: boolean;
}

type Phase = 'future' | 'today' | 'past';

function diffCountdown(target: Date, now: Date): { d: number; h: number; m: number; phase: Phase } {
  const ms = target.getTime() - now.getTime();
  if (ms > 0) {
    return {
      d: Math.floor(ms / 86_400_000),
      h: Math.floor((ms % 86_400_000) / 3_600_000),
      m: Math.floor((ms % 3_600_000) / 60_000),
      phase: 'future',
    };
  }
  // ms <= 0 — distinguish "arrival is today" from "arrival was in the past".
  // Bookings IN_PROGRESS for multiple days would otherwise keep showing
  // "Today's the day!" for the entire stay.
  const elapsedMs = -ms;
  const phase: Phase = elapsedMs < 24 * 3600 * 1000 ? 'today' : 'past';
  return { d: 0, h: 0, m: 0, phase };
}

export default function CountdownHero({ bookingId, startDate, petName, locale }: Props) {
  const fr = locale === 'fr';
  const target = new Date(startDate);
  const [now, setNow] = useState(() => new Date());
  const [mood, setMood] = useState<MoodState>({ toy: false, treat: false, music: false });

  useEffect(() => {
    // Skip ticking entirely if we're already in 'past' phase — the component
    // returns null below, but a running interval would still fire forever
    // and drain battery on a phone left on the screen.
    const target0 = new Date(startDate);
    if (diffCountdown(target0, new Date()).phase === 'past') return;
    // Tick once per minute — enough granularity. Stop self-tick once we
    // transition into 'past' so a long-lived tab doesn't keep firing.
    const id = setInterval(() => {
      const newNow = new Date();
      setNow(newNow);
      if (diffCountdown(target0, newNow).phase === 'past') clearInterval(id);
    }, 60_000);
    return () => clearInterval(id);
  }, [startDate]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`mood:${bookingId}`);
      if (raw) setMood(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [bookingId]);

  function toggle(key: keyof MoodState) {
    setMood((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(`mood:${bookingId}`, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  const { d, h, m, phase } = diffCountdown(target, now);

  // Hide if arrival is more than 7 days away — too far to feel urgent.
  if (phase === 'future' && d > 7) return null;
  // Hide once the stay started more than 24h ago — the Live Stay Feed
  // takes over, the countdown loses meaning.
  if (phase === 'past') return null;

  const chips = [
    { key: 'toy' as const,   icon: Heart, label: fr ? 'Doudou préféré' : 'Comfort toy' },
    { key: 'treat' as const, icon: Gift,  label: fr ? 'Friandise surprise' : 'Surprise treat' },
    { key: 'music' as const, icon: Music2,label: fr ? 'Musique d\'ambiance' : 'Ambient music' },
  ];

  const completed = chips.filter(c => mood[c.key]).length;

  return (
    <div className="rounded-2xl overflow-hidden border border-[#C9A84C]/30 bg-gradient-to-br from-[#1C1612] via-[#2A1E15] to-[#1C1612] shadow-[0_12px_40px_rgba(196,151,74,0.18)]">
      <div className="px-5 py-5 text-center">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[3px] text-[#C9A84C] mb-2">
          <Sparkles className="h-3 w-3" />
          {fr ? 'Arrivée' : 'Arrival'}
        </div>

        {phase === 'today' ? (
          <div className="text-3xl font-serif font-bold text-[#F5EDD8] mb-1">
            {fr ? "C'est aujourd'hui ! 🐾" : "Today's the day! 🐾"}
          </div>
        ) : (
          <div className="flex items-baseline justify-center gap-2 text-[#F5EDD8] mb-1">
            <span className="text-5xl font-serif font-bold tabular-nums">{d}</span>
            <span className="text-xs uppercase tracking-widest text-[#C9A84C]">
              {fr ? `jour${d > 1 ? 's' : ''}` : `day${d > 1 ? 's' : ''}`}
            </span>
            <span className="text-2xl font-serif tabular-nums text-[#F5EDD8]/80 ml-2">{h}h</span>
            <span className="text-2xl font-serif tabular-nums text-[#F5EDD8]/80">{String(m).padStart(2, '0')}</span>
          </div>
        )}

        <p className="text-[13px] text-[#F5EDD8]/70 mt-2">
          {fr
            ? petName ? `On prépare l'accueil de ${petName}.` : 'On prépare votre arrivée.'
            : petName ? `Getting ${petName}'s welcome ready.` : 'Preparing your arrival.'}
        </p>
      </div>

      {/* Mood Builder */}
      <div className="px-5 pb-5">
        <div className="border-t border-[#C9A84C]/15 pt-4">
          <p className="text-[10px] uppercase tracking-[2px] text-[#C9A84C]/80 mb-3 text-center">
            {fr ? 'Touches personnelles' : 'Personal touches'}
            {completed > 0 && (
              <span className="text-[#C9A84C] ml-2 font-bold">({completed}/3)</span>
            )}
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {chips.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => toggle(key)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all ${
                  mood[key]
                    ? 'bg-[#C9A84C] text-[#1C1612] shadow-[0_4px_12px_rgba(196,151,74,0.4)]'
                    : 'bg-white/5 text-[#F5EDD8]/70 border border-[#C9A84C]/20 hover:border-[#C9A84C]/50'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {mood[key] && <span className="text-[#1C1612]">✓</span>}
              </button>
            ))}
          </div>
          {completed === 3 && (
            <p className="text-center text-[11px] text-[#C9A84C] mt-3 italic">
              {fr
                ? "Vos préférences sont notées 🌟 On s'occupe de tout."
                : "Your touches are noted 🌟 We'll take care of everything."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
