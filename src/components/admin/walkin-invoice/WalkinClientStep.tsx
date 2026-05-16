'use client';

// Step 1 — Client picker (existing autocomplete OR anonymous free-text).

import ClientSearchSelect from '../ClientSearchSelect';
import type { ClientMode } from './types';

interface Props {
  fr: boolean;
  locale: string;
  mode: ClientMode;
  onModeChange: (m: ClientMode) => void;
  clientId: string;
  onClientIdChange: (id: string) => void;
  anonName: string;
  onAnonNameChange: (n: string) => void;
}

export default function WalkinClientStep({
  fr, locale, mode, onModeChange, clientId, onClientIdChange, anonName, onAnonNameChange,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2 p-1 bg-[#F5EAD0]/40 rounded-lg">
        <button
          type="button"
          onClick={() => onModeChange('existing')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === 'existing' ? 'bg-white shadow-sm text-charcoal' : 'text-gray-500'
          }`}
        >
          {fr ? '👤 Client existant' : '👤 Existing client'}
        </button>
        <button
          type="button"
          onClick={() => onModeChange('anonymous')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === 'anonymous' ? 'bg-white shadow-sm text-charcoal' : 'text-gray-500'
          }`}
        >
          {fr ? '👻 Client anonyme' : '👻 Anonymous'}
        </button>
      </div>

      {mode === 'existing' ? (
        <div>
          <label className="block text-xs font-medium text-charcoal mb-1.5">
            {fr ? 'Rechercher un client (nom / email)' : 'Search client (name / email)'}
          </label>
          <ClientSearchSelect
            value={clientId}
            onChange={onClientIdChange}
            locale={locale}
          />
          <p className="text-xs text-gray-500 mt-1.5">
            {fr
              ? 'La facture apparaîtra dans l’historique de ce client.'
              : 'The invoice will appear in this client’s history.'}
          </p>
        </div>
      ) : (
        <div>
          <label className="block text-xs font-medium text-charcoal mb-1.5">
            {fr ? 'Nom (optionnel)' : 'Name (optional)'}
          </label>
          <input
            type="text"
            value={anonName}
            onChange={(e) => onAnonNameChange(e.target.value)}
            placeholder={fr ? 'Ex : passage, particulier…' : 'E.g. walk-in, guest…'}
            className="w-full px-3 py-2 rounded-lg border border-[#E2C048]/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
            maxLength={120}
          />
          <p className="text-xs text-gray-500 mt-1.5">
            {fr
              ? 'La facture sera rattachée au client générique "Walk-in anonyme".'
              : 'The invoice will be attached to the shared "Walk-in anonymous" client.'}
          </p>
        </div>
      )}
    </div>
  );
}
