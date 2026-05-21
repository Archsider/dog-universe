'use client';

// Step 1 — Client picker : existing (autocomplete) / new (creates a
// persistent walk-in User) / anonymous (shared generic row).

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
  newClientName: string;
  onNewClientNameChange: (n: string) => void;
  newClientPhone: string;
  onNewClientPhoneChange: (p: string) => void;
}

const TABS: { value: ClientMode; fr: string; en: string }[] = [
  { value: 'existing', fr: '👤 Existant', en: '👤 Existing' },
  { value: 'new', fr: '✨ Nouveau', en: '✨ New' },
  { value: 'anonymous', fr: '👻 Anonyme', en: '👻 Anonymous' },
];

export default function WalkinClientStep({
  fr, locale, mode, onModeChange, clientId, onClientIdChange,
  anonName, onAnonNameChange,
  newClientName, onNewClientNameChange, newClientPhone, onNewClientPhoneChange,
}: Props) {
  // Loose : a walk-in phone is a contact note, not a login. Tolerate foreign /
  // landline / unusual formats — mirror of the server regex in
  // /api/admin/walkin-clients. 6–15 digits with an optional leading "+".
  const phoneValid =
    !newClientPhone.trim() || /^\+?\d{6,15}$/.test(newClientPhone.replace(/[\s.\-()]/g, ''));

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 bg-[#F5EAD0]/40 rounded-lg">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onModeChange(t.value)}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === t.value ? 'bg-white shadow-sm text-charcoal' : 'text-gray-500'
            }`}
          >
            {fr ? t.fr : t.en}
          </button>
        ))}
      </div>

      {mode === 'existing' && (
        <div>
          <label className="block text-xs font-medium text-charcoal mb-1.5">
            {fr ? 'Rechercher un client (nom / email)' : 'Search client (name / email)'}
          </label>
          <ClientSearchSelect value={clientId} onChange={onClientIdChange} locale={locale} />
          <p className="text-xs text-gray-500 mt-1.5">
            {fr ? 'La facture apparaîtra dans l’historique de ce client.' : 'The invoice will appear in this client’s history.'}
          </p>
        </div>
      )}

      {mode === 'new' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-charcoal mb-1.5">
              {fr ? 'Nom complet *' : 'Full name *'}
            </label>
            <input
              type="text"
              value={newClientName}
              onChange={(e) => onNewClientNameChange(e.target.value)}
              placeholder={fr ? 'Ex : Karim Benani' : 'E.g. Karim Benani'}
              className="w-full px-3 py-2 rounded-lg border border-[#E2C048]/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
              maxLength={100}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-charcoal mb-1.5">
              {fr ? 'Téléphone (optionnel)' : 'Phone (optional)'}
            </label>
            <input
              type="tel"
              value={newClientPhone}
              onChange={(e) => onNewClientPhoneChange(e.target.value)}
              placeholder="0612345678"
              className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 ${
                phoneValid ? 'border-[#E2C048]/40 focus:ring-[#C4974A]/40' : 'border-red-300 focus:ring-red-300'
              }`}
              maxLength={30}
            />
            {!phoneValid && (
              <p className="text-xs text-red-600 mt-1">
                {fr ? 'Numéro invalide — 6 à 15 chiffres, "+" optionnel.' : 'Invalid number — 6 to 15 digits, optional "+".'}
              </p>
            )}
          </div>
          <p className="text-xs text-gray-500">
            {fr
              ? 'Un vrai client est créé et conservé — ses prochaines factures lui seront rattachées. Anti-doublon par téléphone.'
              : 'A real client is created and kept — future invoices attach to them. De-duplicated by phone.'}
          </p>
        </div>
      )}

      {mode === 'anonymous' && (
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
              ? 'La facture sera rattachée au client générique "Walk-in anonyme" (non conservé individuellement).'
              : 'The invoice attaches to the shared "Walk-in anonymous" client (not individually kept).'}
          </p>
        </div>
      )}
    </div>
  );
}
