'use client';

// Cmd+K command palette — universal admin search.  Press ⌘K (Mac) or
// Ctrl+K (Win/Linux) anywhere in /admin/* to open.  Searches clients,
// bookings, invoices, pets with one keystroke.
//
// Source : Wave 6 (Admin classe mondiale, Feature #2).

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, User, CalendarCheck, FileText, PawPrint, X, Loader2 } from 'lucide-react';

interface SearchResult {
  type: 'client' | 'booking' | 'invoice' | 'pet';
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

const TYPE_ICON: Record<SearchResult['type'], React.ElementType> = {
  client: User,
  booking: CalendarCheck,
  invoice: FileText,
  pet: PawPrint,
};

const TYPE_LABEL_FR: Record<SearchResult['type'], string> = {
  client: 'Client',
  booking: 'Réservation',
  invoice: 'Facture',
  pet: 'Animal',
};

interface Props {
  locale: string;
}

export default function CommandPalette({ locale }: Props) {
  const fr = locale === 'fr';
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Global keyboard shortcut Cmd+K / Ctrl+K + global custom event so other
  // components (e.g. mobile search button in the admin top bar) can open
  // the palette without a keyboard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    function onCustomOpen() {
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('command-palette:open', onCustomOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('command-palette:open', onCustomOpen);
    };
  }, []);

  // Focus the input on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else {
      setQuery('');
      setResults([]);
      setActiveIdx(0);
    }
  }, [open]);

  // Debounced fetch
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const h = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/search?q=${encodeURIComponent(query)}`);
        if (r.ok) {
          const j: { results: SearchResult[] } = await r.json();
          setResults(j.results);
          setActiveIdx(0);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }, 180);
    return () => clearTimeout(h);
  }, [query, open]);

  function navigateToActive(idx: number) {
    const target = results[idx];
    if (!target) return;
    setOpen(false);
    router.push(`/${locale}${target.href}`);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      navigateToActive(activeIdx);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label={fr ? 'Recherche universelle' : 'Universal search'}
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] px-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-[#C4974A]/30"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search className="h-5 w-5 text-charcoal/40" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={fr ? 'Rechercher client, résa, facture, animal…' : 'Search client, booking, invoice, pet…'}
            className="flex-1 outline-none text-base placeholder-charcoal/30"
          />
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-charcoal/40" />
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-200 text-[10px] text-charcoal/40 font-mono">
              ESC
            </kbd>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={fr ? 'Fermer' : 'Close'}
            className="sm:hidden text-charcoal/40 hover:text-charcoal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim().length < 2 ? (
            <div className="px-4 py-12 text-center text-sm text-charcoal/40">
              {fr ? 'Tapez au moins 2 caractères' : 'Type at least 2 characters'}
              <div className="mt-3 text-[11px]">
                <kbd className="px-1.5 py-0.5 rounded border border-gray-200 font-mono">↑↓</kbd>
                {' '}{fr ? 'pour naviguer' : 'to navigate'}{' · '}
                <kbd className="px-1.5 py-0.5 rounded border border-gray-200 font-mono">↵</kbd>
                {' '}{fr ? 'pour ouvrir' : 'to open'}
              </div>
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="px-4 py-12 text-center text-sm text-charcoal/40">
              {fr ? 'Aucun résultat' : 'No results'}
            </div>
          ) : (
            <ul className="py-1">
              {results.map((r, i) => {
                const Icon = TYPE_ICON[r.type];
                const isActive = i === activeIdx;
                return (
                  <li key={`${r.type}:${r.id}`}>
                    <button
                      type="button"
                      onClick={() => navigateToActive(i)}
                      onMouseEnter={() => setActiveIdx(i)}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                        isActive ? 'bg-[#FFF9E8]' : 'hover:bg-gray-50'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#C4974A]' : 'text-charcoal/40'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-charcoal truncate">{r.title}</p>
                        {r.subtitle && (
                          <p className="text-xs text-charcoal/50 truncate">{r.subtitle}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] uppercase tracking-wider font-semibold text-charcoal/30">
                        {fr ? TYPE_LABEL_FR[r.type] : r.type}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="hidden sm:flex items-center justify-between border-t border-gray-100 px-4 py-2 text-[10px] text-charcoal/40">
          <span>
            <kbd className="px-1 py-0.5 rounded border border-gray-200 font-mono">⌘K</kbd>
            {' '}/{' '}
            <kbd className="px-1 py-0.5 rounded border border-gray-200 font-mono">Ctrl K</kbd>
            {' '}{fr ? 'pour ouvrir/fermer' : 'to toggle'}
          </span>
          <span>Dog Universe — recherche</span>
        </div>
      </div>
    </div>
  );
}
