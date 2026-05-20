'use client';

// Stats Hero — animated counters banner at the top of /admin/dashboard.
// Shows the 4 vitals : CA du mois, occupancy %, croissance vs M-1, séjours
// du mois.  Counters tween from 0 to the real value on mount (premium
// dashboard feel — like Stripe / Linear).
//
// Source : Wave 6 (Admin classe mondiale, Feature #6).

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Wallet, Users, Bed, ArrowUpRight } from 'lucide-react';

interface Props {
  monthRevenue: number;
  monthRevenuePrev: number;
  monthStays: number;
  monthStaysPrev: number;
  occupancyDogPct: number;
  occupancyCatPct: number;
  locale: string;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function useTween(target: number, durationMs = 1200): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    function step(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(target * easeOutCubic(t));
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

function fmtMAD(n: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n));
}

function pctDelta(curr: number, prev: number): number {
  if (prev <= 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

export default function StatsHero({
  monthRevenue, monthRevenuePrev,
  monthStays, monthStaysPrev,
  occupancyDogPct, occupancyCatPct,
  locale,
}: Props) {
  const fr = locale === 'fr';
  const ar = locale === 'ar';

  const tweenRevenue = useTween(monthRevenue);
  const tweenStays = useTween(monthStays);
  const tweenDogPct = useTween(occupancyDogPct);
  const tweenCatPct = useTween(occupancyCatPct);

  const revDelta = pctDelta(monthRevenue, monthRevenuePrev);
  const staysDelta = pctDelta(monthStays, monthStaysPrev);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        icon={<Wallet className="h-4 w-4" />}
        label={fr ? 'CA du mois' : ar ? 'إيرادات الشهر' : 'Month revenue'}
        value={`${fmtMAD(tweenRevenue)} MAD`}
        delta={revDelta}
        accent
      />
      <StatCard
        icon={<Users className="h-4 w-4" />}
        label={fr ? 'Séjours du mois' : ar ? 'إقامات الشهر' : 'Stays this month'}
        value={String(Math.round(tweenStays))}
        delta={staysDelta}
      />
      <StatCard
        icon={<Bed className="h-4 w-4" />}
        label={fr ? 'Occupation chiens' : ar ? 'إشغال الكلاب' : 'Dog occupancy'}
        value={`${Math.round(tweenDogPct)}%`}
        gauge={tweenDogPct}
        species="dog"
      />
      <StatCard
        icon={<Bed className="h-4 w-4" />}
        label={fr ? 'Occupation chats' : ar ? 'إشغال القطط' : 'Cat occupancy'}
        value={`${Math.round(tweenCatPct)}%`}
        gauge={tweenCatPct}
        species="cat"
      />
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta?: number;
  accent?: boolean;
  gauge?: number;
  species?: 'dog' | 'cat';
}

function StatCard({ icon, label, value, delta, accent, gauge, species }: StatCardProps) {
  const showDelta = typeof delta === 'number' && Number.isFinite(delta);
  const isPositive = (delta ?? 0) >= 0;

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm ${
      accent ? 'border-[#C4974A]/40 bg-gradient-to-br from-[#FFF9E8] to-white' : 'border-ivory-200 bg-white'
    }`}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[2px] font-semibold mb-2">
        <span className={`p-1.5 rounded-md ${accent ? 'bg-[#C4974A]/20 text-[#8B6914]' : 'bg-ivory-100 text-charcoal/60'}`}>
          {icon}
        </span>
        <span className={accent ? 'text-[#8B6914]' : 'text-charcoal/50'}>{label}</span>
      </div>
      <p className={`font-serif font-bold leading-tight ${accent ? 'text-[#1C1612] text-2xl' : 'text-charcoal text-2xl'}`}>
        {value}
      </p>
      {showDelta && (
        <div className={`mt-2 inline-flex items-center gap-1 text-[11px] font-semibold ${
          isPositive ? 'text-emerald-700' : 'text-red-600'
        }`}>
          {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {isPositive ? '+' : ''}{delta!.toFixed(1)}%
          <span className="text-charcoal/40 font-normal">vs M-1</span>
        </div>
      )}
      {typeof gauge === 'number' && (
        <div className="mt-3">
          <div className="h-1.5 rounded-full bg-ivory-100 overflow-hidden">
            <div
              className={`h-full transition-[width] duration-700 ${
                gauge >= 90 ? 'bg-red-500'
                : gauge >= 70 ? 'bg-amber-500'
                : species === 'cat' ? 'bg-purple-500' : 'bg-[#C4974A]'
              }`}
              style={{ width: `${Math.min(100, gauge)}%` }}
            />
          </div>
        </div>
      )}
      {accent && (
        <div className="absolute top-2 right-2 text-[#C4974A]/30">
          <ArrowUpRight className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
