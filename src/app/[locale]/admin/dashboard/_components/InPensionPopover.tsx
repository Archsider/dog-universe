'use client';

// "X dans nos murs" → luxe gold popover listing the named guests currently
// in the pension. Opens on hover (desktop) + tap (mobile), lazy-fetches the
// list, each row links to the booking. Dark #141428 + #D4AF37 — same palette
// as the PLATINUM member card. Source : user request "gold premium ultime luxe".

import { useEffect, useRef, useState } from 'react';
import { Home, ChevronDown } from 'lucide-react';

interface PetRow {
  bookingId: string;
  petId: string;
  petName: string;
  species: string;
  clientName: string;
  endDate: string | null;
  isOpenEnded: boolean;
}

export default function InPensionPopover({ count, locale }: { count: number; locale: string }) {
  const fr = locale === 'fr';
  const ar = locale === 'ar';
  const [open, setOpen] = useState(false);
  const [pets, setPets] = useState<PetRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  const label = fr ? `${count} dans nos murs` : ar ? `${count} داخل البنسيون` : `${count} on site`;

  // Lazy-load on open ; reset when closed so each open shows fresh data.
  useEffect(() => {
    if (!open) {
      setPets(null);
      return;
    }
    let alive = true;
    setLoading(true);
    fetch('/api/admin/dashboard/in-pension', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { pets: [] }))
      .then((d) => { if (alive) setPets(Array.isArray(d.pets) ? d.pets : []); })
      .catch(() => { if (alive) setPets([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open]);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const fmtDate = (iso: string | null, isOpenEnded: boolean): string => {
    if (isOpenEnded || !iso) return fr ? 'départ ouvert' : ar ? 'مفتوح' : 'open-ended';
    return new Date(iso).toLocaleDateString(fr ? 'fr-FR' : 'en-GB', { day: '2-digit', month: 'short' });
  };

  return (
    <span
      ref={ref}
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 font-medium underline decoration-dotted decoration-[#C4974A]/50 underline-offset-4 hover:decoration-[#C4974A] cursor-pointer"
      >
        {label}
        <ChevronDown className={`h-3 w-3 text-[#C4974A] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-72 max-w-[85vw] rounded-2xl border border-[#D4AF37]/30 bg-[#141428] text-[#F5EDD8] shadow-2xl shadow-black/40 overflow-hidden text-left"
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[#D4AF37]/15 bg-gradient-to-r from-[#D4AF37]/15 to-transparent">
            <Home className="h-4 w-4 text-[#D4AF37]" />
            <span className="text-[11px] uppercase tracking-[2px] font-semibold text-[#D4AF37]">
              {fr ? 'Pensionnaires présents' : ar ? 'النزلاء الحاضرون' : 'Current guests'}
            </span>
            <span className="ml-auto text-[11px] tabular-nums text-[#F5EDD8]/60">{count}</span>
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {loading ? (
              <div className="px-4 py-6 text-center text-xs text-[#F5EDD8]/50">
                {fr ? 'Chargement…' : ar ? '…' : 'Loading…'}
              </div>
            ) : !pets || pets.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-[#F5EDD8]/50">
                {fr ? 'Aucun pensionnaire actuellement.' : ar ? 'لا يوجد نزلاء.' : 'No guests right now.'}
              </div>
            ) : (
              pets.map((p, i) => (
                <a
                  key={`${p.bookingId}-${p.petId}-${i}`}
                  href={`/${locale}/admin/reservations/${p.bookingId}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#D4AF37]/10 transition-colors"
                >
                  <span className="text-lg leading-none" aria-hidden>{p.species === 'CAT' ? '🐈' : '🐕'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-serif text-[15px] leading-tight text-[#F5EDD8] truncate">{p.petName}</span>
                    <span className="block text-[11px] text-[#D4AF37]/80 truncate">{p.clientName}</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-[#F5EDD8]/50 tabular-nums whitespace-nowrap">
                    {fmtDate(p.endDate, p.isOpenEnded)}
                  </span>
                </a>
              ))
            )}
          </div>
        </div>
      )}
    </span>
  );
}
