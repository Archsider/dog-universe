'use client';

import { useState } from 'react';
import { Scale, Plus, X, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface WeightEntry {
  id: string;
  weightKg: number;
  measuredAt: string;
  note: string | null;
}

interface Props {
  petId: string;
  locale: string;
  initialEntries: WeightEntry[];
  currentWeight: number | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PetWeightHistorySection({ petId, locale, initialEntries, currentWeight }: Props) {
  const fr = locale === 'fr';
  const [entries, setEntries] = useState<WeightEntry[]>(initialEntries);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [weightKg, setWeightKg] = useState('');
  const [measuredAt, setMeasuredAt] = useState(todayIso());
  const [note, setNote] = useState('');

  const latestWeight = entries.length > 0 ? entries[0].weightKg : currentWeight;

  const handleSubmit = async () => {
    const val = parseFloat(weightKg);
    if (isNaN(val) || val <= 0) {
      toast({ title: fr ? 'Poids invalide' : 'Invalid weight', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/pets/${petId}/weight-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weightKg: val, measuredAt, note: note.trim() || null }),
      });
      if (!res.ok) throw new Error('Failed');
      const created: WeightEntry = await res.json();
      // Insert sorted by measuredAt desc
      setEntries(prev => [created, ...prev].sort((a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime()));
      setShowForm(false);
      setWeightKg('');
      setNote('');
      setMeasuredAt(todayIso());
      toast({ title: fr ? 'Poids enregistré' : 'Weight recorded', variant: 'success' });
    } catch {
      toast({ title: fr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-gold-500" />
          <h3 className="font-semibold text-charcoal text-sm">
            {fr ? 'Suivi du poids' : 'Weight history'}
          </h3>
          {latestWeight !== null && latestWeight !== undefined && (
            <span className="text-sm font-bold text-charcoal ml-1">— {latestWeight} kg</span>
          )}
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 text-xs text-gold-600 hover:text-gold-800 font-medium"
        >
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? (fr ? 'Annuler' : 'Cancel') : (fr ? 'Ajouter' : 'Add')}
        </button>
      </div>

      {showForm && (
        <div className="mb-4 bg-ivory-50 rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">
                {fr ? 'Poids (kg) *' : 'Weight (kg) *'}
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={weightKg}
                onChange={e => setWeightKg(e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-gold-400"
                placeholder="ex: 12.5"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">
                {fr ? 'Date de mesure' : 'Measurement date'}
              </label>
              <input
                type="date"
                value={measuredAt}
                onChange={e => setMeasuredAt(e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-gold-400"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1">
              {fr ? 'Note (optionnel)' : 'Note (optional)'}
            </label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-gold-400"
              placeholder={fr ? 'ex: pesée à l\'arrivée' : 'e.g. weighed on arrival'}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading || !weightKg}
            className="w-full flex items-center justify-center gap-2 py-2 bg-gold-500 hover:bg-gold-600 text-white text-sm font-medium rounded-md disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {fr ? 'Enregistrer' : 'Save'}
          </button>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-gray-400 italic">
          {fr ? 'Aucune mesure enregistrée' : 'No measurements recorded'}
        </p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry, i) => (
            <div
              key={entry.id}
              className={`flex items-center justify-between py-1.5 text-sm ${i < entries.length - 1 ? 'border-b border-ivory-100' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${i === 0 ? 'text-charcoal' : 'text-gray-500'}`}>
                  {entry.weightKg} kg
                </span>
                {i === 0 && (
                  <span className="text-xs bg-gold-50 text-gold-700 px-1.5 py-0.5 rounded font-medium">
                    {fr ? 'actuel' : 'current'}
                  </span>
                )}
                {entry.note && (
                  <span className="text-xs text-gray-400 italic">{entry.note}</span>
                )}
              </div>
              <span className="text-xs text-gray-400">
                {new Date(entry.measuredAt).toLocaleDateString(
                  fr ? 'fr-FR' : 'en-US',
                  { year: 'numeric', month: 'short', day: 'numeric' }
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
