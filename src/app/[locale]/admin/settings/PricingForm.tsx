'use client';

import { useState } from 'react';
import { Settings, DollarSign, Scissors, Car, Save, Loader2, CheckCircle } from 'lucide-react';

interface FieldDef {
  key: string;
  label: string;
  unit: string;
}

const PENSION_FIELDS: FieldDef[] = [
  { key: 'boarding_dog_per_night', label: 'Pension chien / nuit', unit: 'MAD' },
  { key: 'boarding_cat_per_night', label: 'Pension chat / nuit', unit: 'MAD' },
  { key: 'boarding_dog_long_stay', label: 'Pension chien long séjour / nuit', unit: 'MAD' },
  { key: 'boarding_dog_multi', label: 'Pension chien multi (≥2) / nuit', unit: 'MAD' },
  { key: 'long_stay_threshold', label: 'Seuil long séjour (nuits)', unit: 'nuits' },
];

const GROOMING_FIELDS: FieldDef[] = [
  { key: 'grooming_small_dog', label: 'Toilettage petit chien', unit: 'MAD' },
  { key: 'grooming_large_dog', label: 'Toilettage grand chien', unit: 'MAD' },
];

const TAXI_FIELDS: FieldDef[] = [
  { key: 'taxi_standard', label: 'Taxi standard', unit: 'MAD' },
  { key: 'taxi_vet', label: 'Taxi vétérinaire', unit: 'MAD' },
  { key: 'taxi_airport', label: 'Taxi aéroport', unit: 'MAD' },
];

export default function PricingForm({ initialValues }: { initialValues: Record<string, string> }) {
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (key: string, val: string) => {
    setValues(prev => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const renderField = ({ key, label, unit }: FieldDef) => (
    <div key={key} className="flex items-center justify-between py-3 border-b border-ivory-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-charcoal">{label}</p>
        <p className="text-xs text-gray-400 font-mono mt-0.5">{key}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="0"
          step="1"
          value={values[key] ?? ''}
          onChange={e => handleChange(key, e.target.value)}
          className="w-24 text-right px-3 py-1.5 border border-ivory-200 rounded-lg text-sm font-medium text-charcoal focus:outline-none focus:border-gold-400 bg-white"
        />
        <span className="text-xs text-gray-400 w-8">{unit}</span>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-gold-500" />
          <h1 className="text-2xl font-serif font-bold text-charcoal">Tarifs</h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-gold-500 hover:bg-gold-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Enregistrement...</>
          ) : saved ? (
            <><CheckCircle className="h-4 w-4" />Enregistré !</>
          ) : (
            <><Save className="h-4 w-4" />Enregistrer les tarifs</>
          )}
        </button>
      </div>
      <p className="text-sm text-charcoal/60 mb-8">Modifiez les tarifs appliqués aux réservations.</p>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gold-50 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-gold-500" />
            </div>
            <h2 className="font-semibold text-charcoal">Tarifs Pension</h2>
          </div>
          <div>{PENSION_FIELDS.map(renderField)}</div>
        </div>

        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
              <Scissors className="h-4 w-4 text-purple-500" />
            </div>
            <h2 className="font-semibold text-charcoal">Tarifs Toilettage</h2>
          </div>
          <div>{GROOMING_FIELDS.map(renderField)}</div>
        </div>

        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Car className="h-4 w-4 text-blue-500" />
            </div>
            <h2 className="font-semibold text-charcoal">Tarifs Taxi</h2>
          </div>
          <div>{TAXI_FIELDS.map(renderField)}</div>
        </div>
      </div>

      <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-amber-800 mb-2">💡 Comment ça marche</p>
        <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
          <li>Les tarifs sont appliqués automatiquement à chaque nouvelle réservation.</li>
          <li>Les réservations existantes ne sont pas modifiées.</li>
          <li>Le seuil long séjour détermine à partir de combien de nuits le tarif réduit s'applique.</li>
          <li>Le tarif multi-chien s'applique si ≥2 chiens OU si le séjour dépasse le seuil.</li>
        </ul>
      </div>
    </div>
  );
}
