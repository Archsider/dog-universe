'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ClientLite, Species, Translations, WalkInPet } from './types';

interface Props {
  t: Translations;
  walkInMode: boolean;
  selectedClient: ClientLite | null;
  selectedPetIds: string[];
  togglePet: (id: string) => void;
  walkInPets: WalkInPet[];
  setWalkInPets: (next: WalkInPet[] | ((prev: WalkInPet[]) => WalkInPet[])) => void;
}

/**
 * Pets section — two modes:
 *   - walk-in: editable list of free-form pets (add/remove rows)
 *   - existing client: checkbox list of the client's saved pets
 *
 * If the client has no pets, we surface the explanatory empty state
 * instead of a blank list (parent's validate() will block submission too).
 */
export function PetsSection({
  t,
  walkInMode,
  selectedClient,
  selectedPetIds,
  togglePet,
  walkInPets,
  setWalkInPets,
}: Props) {
  const updateAt = (idx: number, patch: Partial<WalkInPet>): void => {
    setWalkInPets((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  return (
    <section className="bg-white rounded-xl border border-ivory-200 p-5 shadow-card">
      <h2 className="text-lg font-semibold text-charcoal mb-3">{t.petsSection}</h2>
      {walkInMode ? (
        <div className="space-y-3">
          {walkInPets.map((p, i) => (
            <div key={i} className="grid sm:grid-cols-5 gap-2 items-end">
              <div className="sm:col-span-2">
                <Label>{t.petName} *</Label>
                <Input value={p.name} onChange={(e) => updateAt(i, { name: e.target.value })} />
              </div>
              <div>
                <Label>{t.species}</Label>
                <select
                  value={p.species}
                  onChange={(e) => updateAt(i, { species: e.target.value as Species })}
                  className="w-full h-10 px-3 rounded-lg border border-ivory-200 bg-white text-sm"
                >
                  <option value="DOG">{t.dog}</option>
                  <option value="CAT">{t.cat}</option>
                </select>
              </div>
              <div>
                <Label>{t.dob}</Label>
                <Input
                  type="date"
                  value={p.dateOfBirth}
                  onChange={(e) => updateAt(i, { dateOfBirth: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder={t.breed}
                  value={p.breed}
                  onChange={(e) => updateAt(i, { breed: e.target.value })}
                />
                {walkInPets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setWalkInPets((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setWalkInPets((prev) => [
                ...prev,
                { name: '', species: 'DOG', dateOfBirth: '', breed: '' },
              ])
            }
          >
            + {t.addPet}
          </Button>
        </div>
      ) : !selectedClient ? (
        <p className="text-sm text-gray-400">{t.selectClient}</p>
      ) : selectedClient.pets.length === 0 ? (
        <p className="text-sm text-gray-400">{t.noPets}</p>
      ) : (
        <div className="space-y-1">
          {selectedClient.pets.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-ivory-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedPetIds.includes(p.id)}
                onChange={() => togglePet(p.id)}
                className="h-4 w-4"
              />
              <span className="text-sm">
                {p.name}{' '}
                <span className="text-xs text-gray-500">
                  ({p.species === 'DOG' ? t.dog : t.cat})
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
