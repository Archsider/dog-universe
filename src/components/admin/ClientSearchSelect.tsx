'use client';

import { useEffect, useRef, useState } from 'react';

interface Client {
  id: string;
  name: string;
  email: string;
}

interface Props {
  value: string;
  onChange: (clientId: string) => void;
  locale: string;
  /** Show a "Walk-in" option at the top */
  includeWalkIn?: boolean;
  /** Pre-resolved label (optional). If set, displayed instead of fetching. */
  initialLabel?: string;
  placeholder?: string;
}

/**
 * Debounced client autocomplete. Calls /api/admin/clients/search?q=.
 * - Empty / <2 chars query → top 20 most recent clients.
 * - Otherwise → up to 50 matches by name/email (case-insensitive).
 *
 * Replaces the old `take: 1000` clients dropdown on /admin/billing.
 */
export default function ClientSearchSelect({
  value,
  onChange,
  locale,
  includeWalkIn = false,
  initialLabel,
  placeholder,
}: Props) {
  const fr = locale === 'fr';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string>(initialLabel ?? '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Debounced fetch
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetch(`/api/admin/clients/search?q=${encodeURIComponent(query)}`)
        .then(r => r.ok ? r.json() : { clients: [] })
        .then(data => setResults(data.clients ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, query.length < 2 ? 0 : 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  // If value is set externally and we have no label, fetch it once
  useEffect(() => {
    if (!value || value === 'WALK_IN' || selectedLabel) return;
    fetch(`/api/admin/clients/search?q=${encodeURIComponent(value)}`)
      .then(r => r.ok ? r.json() : { clients: [] })
      .then((data: { clients: Client[] }) => {
        const found = data.clients.find(c => c.id === value);
        if (found) setSelectedLabel(found.name);
      })
      .catch(() => { /* noop */ });
  }, [value, selectedLabel]);

  const selectClient = (c: { id: string; name: string }) => {
    onChange(c.id);
    setSelectedLabel(c.name);
    setQuery('');
    setOpen(false);
  };

  const clear = () => {
    onChange('');
    setSelectedLabel('');
    setQuery('');
  };

  // Display text inside the trigger
  const display =
    value === 'WALK_IN'
      ? (fr ? '➕ Nouveau client de passage' : '➕ New walk-in client')
      : selectedLabel || (fr ? '— Sélectionner —' : '— Select —');

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="mt-1 w-full border border-gray-200 rounded-md text-sm px-3 py-2 focus:outline-none focus:border-gold-400 bg-white text-left flex items-center justify-between"
      >
        <span className={value ? 'text-charcoal' : 'text-gray-400'}>{display}</span>
        {value && (
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); clear(); }}
            className="text-gray-400 hover:text-red-500 ml-2 text-xs"
          >
            ✕
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-80 overflow-y-auto">
          <div className="sticky top-0 bg-white p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={placeholder ?? (fr ? 'Rechercher un client…' : 'Search a client…')}
              className="w-full text-sm px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-gold-400"
            />
          </div>

          {includeWalkIn && (
            <button
              type="button"
              onClick={() => selectClient({ id: 'WALK_IN', name: fr ? '➕ Nouveau client de passage' : '➕ New walk-in client' })}
              className="w-full text-left text-sm px-3 py-2 hover:bg-ivory-50 border-b border-gray-50"
            >
              ➕ {fr ? 'Nouveau client de passage' : 'New walk-in client'}
            </button>
          )}

          {loading && (
            <div className="px-3 py-3 text-xs text-gray-400">{fr ? 'Recherche…' : 'Searching…'}</div>
          )}

          {!loading && results.length === 0 && (
            <div className="px-3 py-3 text-xs text-gray-400">
              {query.length < 2
                ? (fr ? 'Tapez 2 caractères pour chercher' : 'Type 2+ characters to search')
                : (fr ? 'Aucun résultat' : 'No results')}
            </div>
          )}

          {!loading && results.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => selectClient(c)}
              className="w-full text-left text-sm px-3 py-2 hover:bg-ivory-50"
            >
              <div className="font-medium text-charcoal">{c.name}</div>
              {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
