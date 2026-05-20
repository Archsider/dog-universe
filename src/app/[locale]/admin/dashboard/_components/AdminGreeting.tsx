'use client';

// Live admin greeting — polls /api/admin/dashboard/snapshot every 30 s
// and animates the subtitle counters when they change.  Adds a discreet
// "Live" pulse dot to signal the active connection.
//
// Source : Wave 6 (Admin classe mondiale, Feature #1).

import { useEffect, useRef, useState } from 'react';
import GreetingHeader from '@/components/shared/GreetingHeader';

interface InitialProps {
  firstName: string;
  locale: string;
  arrivalsToday: number;
  inPension: number;
  pending: number;
}

interface Snapshot {
  arrivalsToday: number;
  departuresToday: number;
  taxiToday: number;
  dogsIn: number;
  catsIn: number;
  dogsLimit: number;
  catsLimit: number;
  pending: number;
  timestamp: string;
}

const CASA_OFFSET_MIN = 60;
const POLL_INTERVAL_MS = 30_000;

function hourCasa(d: Date): number {
  const casaMs = d.getTime() + CASA_OFFSET_MIN * 60_000;
  return new Date(casaMs).getUTCHours();
}

function salutation(hour: number, locale: string): string {
  const fr = locale === 'fr';
  const ar = locale === 'ar';
  if (hour < 5)  return fr ? 'Bonne nuit' : ar ? 'تصبح على خير' : 'Good night';
  if (hour < 12) return fr ? 'Bonjour'    : ar ? 'صباح الخير'   : 'Good morning';
  if (hour < 18) return fr ? 'Bon après-midi' : ar ? 'مساء الخير' : 'Good afternoon';
  return fr ? 'Bonsoir' : ar ? 'مساء الخير' : 'Good evening';
}

function buildSubtitle(s: { locale: string; arrivalsToday: number; inPension: number; pending: number }): string {
  const fr = s.locale === 'fr';
  const ar = s.locale === 'ar';
  const parts: string[] = [];
  if (s.arrivalsToday > 0) parts.push(fr ? `${s.arrivalsToday} arrivée${s.arrivalsToday > 1 ? 's' : ''} aujourd'hui` : ar ? `${s.arrivalsToday} وصول اليوم` : `${s.arrivalsToday} arrival${s.arrivalsToday > 1 ? 's' : ''} today`);
  if (s.inPension > 0)     parts.push(fr ? `${s.inPension} dans nos murs` : ar ? `${s.inPension} داخل البنسيون` : `${s.inPension} on site`);
  if (s.pending > 0)       parts.push(fr ? `${s.pending} à valider` : ar ? `${s.pending} في الانتظار` : `${s.pending} to validate`);
  if (parts.length === 0)  return fr ? 'Pension calme aujourd\'hui ✨' : ar ? 'هادئ اليوم ✨' : 'Quiet day in the pension ✨';
  return parts.join(' · ');
}

export default function AdminGreeting({ firstName, locale, arrivalsToday, inPension, pending }: InitialProps) {
  const [live, setLive] = useState({ arrivalsToday, inPension, pending });
  const [changedAt, setChangedAt] = useState<number>(0);
  const prevRef = useRef(live);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const r = await fetch('/api/admin/dashboard/snapshot', { cache: 'no-store' });
        if (!r.ok) return;
        const s: Snapshot = await r.json();
        if (cancelled) return;
        const next = { arrivalsToday: s.arrivalsToday, inPension: s.dogsIn + s.catsIn, pending: s.pending };
        const changed = next.arrivalsToday !== prevRef.current.arrivalsToday
                     || next.inPension     !== prevRef.current.inPension
                     || next.pending       !== prevRef.current.pending;
        if (changed) {
          prevRef.current = next;
          setLive(next);
          setChangedAt(Date.now());
        }
      } catch { /* network blip */ }
      finally { if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS); }
    }

    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  const isPulsing = changedAt > 0 && (Date.now() - changedAt) < 2_000;
  const now = new Date();

  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 text-[10px] uppercase tracking-[2px] font-semibold text-emerald-700 bg-white/80 backdrop-blur-sm rounded-full px-2 py-0.5 shadow-sm">
        <span className="relative flex h-2 w-2">
          <span className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 ${isPulsing ? 'animate-ping' : 'opacity-75'}`} />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        Live
      </div>
      <GreetingHeader
        salutation={salutation(hourCasa(now), locale)}
        firstName={firstName}
        subtitle={buildSubtitle({ locale, ...live })}
        variant="light"
      />
    </div>
  );
}
