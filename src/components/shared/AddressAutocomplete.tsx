'use client';

// Address autocomplete — Uber/Careem-style type-ahead for the booking
// wizard. The client types a place, picks a real geocoded suggestion
// (Nominatim via our /api/geocode/search proxy). Selecting a suggestion
// sets the address text AND the lat/lng (which moves the pin), giving a
// far more precise pickup point than reverse-geocoding a roughly-dropped
// pin.
//
// - Debounced 350ms ; min 3 chars.
// - Keyboard nav (↑/↓/Enter/Esc) + click ; a11y combobox roles.
// - Manual free-text still allowed (onChange fires on every keystroke) —
//   selecting a suggestion is optional but recommended.

import { useEffect, useId, useRef, useState, useCallback } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface Suggestion {
  label: string;
  lat: number;
  lng: number;
}

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (label: string, lat: number, lng: number) => void;
  locale: string;
  placeholder?: string;
  className?: string;
}

const DEBOUNCE_MS = 350;
const MIN_CHARS = 3;

export function AddressAutocomplete({
  id, value, onChange, onSelect, locale, placeholder, className,
}: Props) {
  const reactId = useId();
  const listboxId = `${id ?? reactId}-listbox`;
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Suppress the fetch that would otherwise fire right after a selection
  // (the onChange from setting the chosen label shouldn't re-open the list).
  const justSelectedRef = useRef(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback((q: string) => {
    if (q.trim().length < MIN_CHARS) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    fetch(`/api/geocode/search?q=${encodeURIComponent(q)}&lang=${locale}`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : { suggestions: [] }))
      .then((j: { suggestions?: Suggestion[] }) => {
        const list = Array.isArray(j.suggestions) ? j.suggestions : [];
        setSuggestions(list);
        setOpen(list.length > 0);
        setActiveIndex(-1);
      })
      .catch(() => { /* aborted or network — keep manual text */ })
      .finally(() => setLoading(false));
  }, [locale]);

  useEffect(() => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, runSearch]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }, []);

  function pick(s: Suggestion) {
    justSelectedRef.current = true;
    onSelect(s.label, s.lat, s.lng);
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      pick(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          onBlur={() => {
            // Delay so a click on a suggestion registers before close.
            blurTimer.current = setTimeout(() => setOpen(false), 150);
          }}
          placeholder={placeholder}
          className={className}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gold-500" />
        )}
      </div>
      {open && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-gold-200 bg-white shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.lat},${s.lng},${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={e => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex items-start gap-2 px-3 py-2 cursor-pointer text-sm ${
                i === activeIndex ? 'bg-gold-50 text-charcoal' : 'text-charcoal/80 hover:bg-gold-50/50'
              }`}
            >
              <MapPin className="h-4 w-4 text-gold-500 shrink-0 mt-0.5" />
              <span className="leading-snug">{s.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
