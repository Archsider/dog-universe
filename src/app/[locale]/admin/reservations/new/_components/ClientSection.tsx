'use client';

import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ClientLite, Translations } from './types';

interface Props {
  t: Translations;
  clients: ClientLite[];
  walkInMode: boolean;
  setWalkInMode: (v: boolean) => void;
  search: string;
  setSearch: (v: string) => void;
  clientId: string;
  setClientId: (id: string) => void;
  walkIn: { name: string; phone: string; email: string };
  setWalkIn: (v: { name: string; phone: string; email: string }) => void;
  // Parent owns selectedPetIds — we reset it on client switch via callback.
  onClientSwitch: () => void;
}

/**
 * Client picker section — toggles between:
 *   - walk-in mode: free-form name/phone/email inputs
 *   - existing client: searchable list, click-to-select
 *
 * State is fully lifted to the parent NewBookingForm so handleSubmit() can
 * read the entire form in one place. This component is purely presentational.
 */
export function ClientSection({
  t,
  clients,
  walkInMode,
  setWalkInMode,
  search,
  setSearch,
  clientId,
  setClientId,
  walkIn,
  setWalkIn,
  onClientSwitch,
}: Props) {
  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients.slice(0, 50);
    return clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.phone ?? '').toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [clients, search]);

  return (
    <section className="bg-white rounded-xl border border-ivory-200 p-5 shadow-card">
      <h2 className="text-lg font-semibold text-charcoal mb-3">{t.clientSection}</h2>
      <label className="flex items-center gap-2 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={walkInMode}
          onChange={(e) => {
            setWalkInMode(e.target.checked);
            setClientId('');
            onClientSwitch();
          }}
          className="h-4 w-4"
        />
        <span className="text-sm text-charcoal">{t.walkInToggle}</span>
      </label>

      {walkInMode ? (
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="wi-name">{t.walkInName} *</Label>
            <Input
              id="wi-name"
              value={walkIn.name}
              onChange={(e) => setWalkIn({ ...walkIn, name: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="wi-phone">{t.walkInPhone} *</Label>
            <Input
              id="wi-phone"
              value={walkIn.phone}
              onChange={(e) => setWalkIn({ ...walkIn, phone: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="wi-email">{t.walkInEmail}</Label>
            <Input
              id="wi-email"
              type="email"
              value={walkIn.email}
              onChange={(e) => setWalkIn({ ...walkIn, email: e.target.value })}
            />
          </div>
        </div>
      ) : (
        <>
          <Label htmlFor="search">{t.search}</Label>
          <Input
            id="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.search}
            className="mb-2"
          />
          <div className="max-h-56 overflow-y-auto border border-ivory-200 rounded-lg">
            {filteredClients.length === 0 ? (
              <div className="p-3 text-sm text-gray-400">—</div>
            ) : (
              filteredClients.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => {
                    setClientId(c.id);
                    onClientSwitch();
                  }}
                  className={`w-full text-left px-3 py-2 text-sm border-b border-ivory-100 last:border-0 hover:bg-ivory-50 transition-colors ${clientId === c.id ? 'bg-gold-50' : ''}`}
                >
                  <div className="font-medium text-charcoal">{c.name}</div>
                  <div className="text-xs text-gray-500">
                    {c.email}
                    {c.phone ? ` · ${c.phone}` : ''} · {c.pets.length} 🐾
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
