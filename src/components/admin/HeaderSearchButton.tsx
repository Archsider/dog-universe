'use client';

// Visible search trigger — always-present icon button (mobile) or full
// pill with label + Cmd-K hint (desktop).  Dispatches a global custom
// event the CommandPalette listens to, so the palette opens without
// a keyboard shortcut.  Source : user feedback 2026-05-20 — '⌘K invisible
// sur mobile'.

import { Search } from 'lucide-react';

interface Props { locale: string }

export default function HeaderSearchButton({ locale }: Props) {
  const fr = locale === 'fr';
  const ar = locale === 'ar';

  function open() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('command-palette:open'));
  }

  return (
    <>
      {/* Mobile : icon only */}
      <button
        type="button"
        onClick={open}
        aria-label={fr ? 'Recherche' : ar ? 'بحث' : 'Search'}
        className="sm:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg text-charcoal hover:bg-ivory-100 transition-colors"
      >
        <Search className="h-5 w-5" />
      </button>

      {/* Desktop : pill with label + ⌘K hint */}
      <button
        type="button"
        onClick={open}
        className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-ivory-200 bg-[#FAF6F0]/60 hover:border-[#C4974A]/40 hover:bg-white text-sm text-charcoal/60 transition-colors"
      >
        <Search className="h-4 w-4" />
        <span>{fr ? 'Rechercher…' : ar ? 'بحث…' : 'Search…'}</span>
        <kbd className="hidden md:inline-flex items-center text-[10px] font-mono text-charcoal/40 border border-ivory-200 rounded px-1 ml-1">⌘K</kbd>
      </button>
    </>
  );
}
