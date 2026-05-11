'use client';

import { Loader2 } from 'lucide-react';
import { WALK_IN, type Client } from './lib';
import { WalkInForm } from './WalkInForm';
import type { BookingFormState } from './useBookingFormState';

interface Props {
  fr: boolean;
  preselectedClientId?: string;
  preselectedClientName?: string;
  clients: Client[];
  form: BookingFormState;
  togglePet: (id: string) => void;
}

export function ClientPicker({ fr, preselectedClientId, preselectedClientName, clients, form, togglePet }: Props) {
  const {
    clientId, setClientId, clientPets, loadingPets, selectedPetIds,
    walkInName, setWalkInName, walkInPhone, setWalkInPhone, walkInPets, setWalkInPets,
  } = form;
  const isWalkIn = clientId === WALK_IN;

  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
        {fr ? 'Client & animaux' : 'Client & pets'}
      </h3>

      {!preselectedClientId ? (
        <div className="mb-3">
          <label className="text-xs font-medium text-gray-500 block mb-1">Client *</label>
          <select
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-gold-400 bg-white"
          >
            <option value="">{fr ? '— Sélectionner un client —' : '— Select a client —'}</option>
            <option value={WALK_IN}>➕ {fr ? 'Nouveau client de passage' : 'New walk-in client'}</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
            ))}
          </select>
        </div>
      ) : (
        <div className="mb-3 bg-ivory-50 rounded-lg px-3 py-2 text-sm font-medium text-charcoal">
          {preselectedClientName}
        </div>
      )}

      {isWalkIn && (
        <WalkInForm
          fr={fr}
          walkInName={walkInName}
          setWalkInName={setWalkInName}
          walkInPhone={walkInPhone}
          setWalkInPhone={setWalkInPhone}
          walkInPets={walkInPets}
          setWalkInPets={setWalkInPets}
        />
      )}

      {clientId && !isWalkIn && (
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1.5">
            {fr ? 'Animaux *' : 'Pets *'}
          </label>
          {loadingPets ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />{fr ? 'Chargement…' : 'Loading…'}
            </div>
          ) : clientPets.length === 0 ? (
            <p className="text-sm text-gray-400 italic">{fr ? 'Aucun animal' : 'No pets'}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {clientPets.map(pet => (
                <button
                  key={pet.id}
                  type="button"
                  onClick={() => togglePet(pet.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    selectedPetIds.includes(pet.id)
                      ? 'bg-gold-50 border-gold-400 text-gold-700'
                      : 'border-gray-200 text-gray-600 hover:border-gold-300'
                  }`}
                >
                  {pet.name}
                  <span className="text-xs opacity-60 ml-1">
                    ({pet.species === 'DOG' ? (fr ? 'Chien' : 'Dog') : (fr ? 'Chat' : 'Cat')})
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
