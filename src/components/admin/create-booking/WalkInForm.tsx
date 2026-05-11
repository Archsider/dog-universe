'use client';

import { Plus, X } from 'lucide-react';
import { todayIso, todayMinusYears, type WalkInPet } from './lib';

interface Props {
  fr: boolean;
  walkInName: string;
  setWalkInName: (v: string) => void;
  walkInPhone: string;
  setWalkInPhone: (v: string) => void;
  walkInPets: WalkInPet[];
  setWalkInPets: React.Dispatch<React.SetStateAction<WalkInPet[]>>;
}

export function WalkInForm({
  fr, walkInName, setWalkInName, walkInPhone, setWalkInPhone, walkInPets, setWalkInPets,
}: Props) {
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-3">
      <p className="text-xs text-amber-700">
        {fr
          ? 'Client de passage — pas de portail, pas de fidélité, pas de notifications.'
          : 'Walk-in client — no portal access, no loyalty, no notifications.'}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">{fr ? 'Nom *' : 'Name *'}</label>
          <input
            type="text"
            value={walkInName}
            onChange={e => setWalkInName(e.target.value)}
            placeholder={fr ? 'Nom du passager' : 'Walk-in name'}
            maxLength={100}
            className="w-full border border-amber-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-amber-400 bg-white"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">{fr ? 'Téléphone' : 'Phone'}</label>
          <input
            type="tel"
            value={walkInPhone}
            onChange={e => setWalkInPhone(e.target.value)}
            placeholder="+212..."
            maxLength={30}
            className="w-full border border-amber-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-amber-400 bg-white"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-gray-600">{fr ? 'Animaux *' : 'Pets *'}</label>
          <button
            type="button"
            onClick={() => setWalkInPets(prev => [...prev, { name: '', species: 'DOG', dateOfBirth: todayMinusYears(3) }])}
            className="text-xs text-amber-700 hover:text-amber-800 font-medium flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />{fr ? 'Ajouter' : 'Add'}
          </button>
        </div>
        <div className="space-y-2">
          {walkInPets.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_140px_28px] gap-2 items-center">
              <input
                type="text"
                value={p.name}
                onChange={e => setWalkInPets(prev => prev.map((q, idx) => idx === i ? { ...q, name: e.target.value } : q))}
                placeholder={fr ? 'Nom animal' : 'Pet name'}
                maxLength={60}
                className="border border-amber-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-amber-400 bg-white"
              />
              <select
                value={p.species}
                onChange={e => setWalkInPets(prev => prev.map((q, idx) => idx === i ? { ...q, species: e.target.value as 'DOG' | 'CAT' } : q))}
                className="border border-amber-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-amber-400 bg-white"
              >
                <option value="DOG">{fr ? 'Chien' : 'Dog'}</option>
                <option value="CAT">{fr ? 'Chat' : 'Cat'}</option>
              </select>
              <input
                type="date"
                value={p.dateOfBirth}
                onChange={e => setWalkInPets(prev => prev.map((q, idx) => idx === i ? { ...q, dateOfBirth: e.target.value } : q))}
                max={todayIso()}
                className="border border-amber-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-amber-400 bg-white"
              />
              <button
                type="button"
                onClick={() => setWalkInPets(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)}
                disabled={walkInPets.length === 1}
                className="text-gray-400 hover:text-red-500 disabled:opacity-20 flex items-center justify-center"
                aria-label={fr ? 'Retirer' : 'Remove'}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-1">
          {fr
            ? 'Date de naissance approximative acceptée (ex: 1er janvier de l\'année estimée).'
            : 'Approximate date of birth is fine (e.g. Jan 1 of the estimated year).'}
        </p>
      </div>
    </div>
  );
}
