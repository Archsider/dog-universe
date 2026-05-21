'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import type { ClientLite, PetLite, Species, Translations, WalkInPet } from './types';

interface Props {
  t: Translations;
  walkInMode: boolean;
  selectedClient: ClientLite | null;
  selectedPetIds: string[];
  togglePet: (id: string) => void;
  walkInPets: WalkInPet[];
  setWalkInPets: (next: WalkInPet[] | ((prev: WalkInPet[]) => WalkInPet[])) => void;
  /** Called once a pet is persisted for the selected (existing) client. */
  onPetCreated: (pet: PetLite) => void;
}

/**
 * Inline "quick add pet" for an existing client — POSTs to
 * /api/admin/clients/[id]/pets, then bubbles the created pet up so the parent
 * injects it into the list and auto-selects it. DOB is mandatory (project
 * rule + server validator). Used both as the empty-state CTA and as a
 * collapsible "+ add pet" under the checkbox list.
 */
function AddPetInline({
  t,
  clientId,
  onPetCreated,
  onDone,
}: {
  t: Translations;
  clientId: string;
  onPetCreated: (pet: PetLite) => void;
  onDone?: () => void;
}) {
  const [name, setName] = useState('');
  const [species, setSpecies] = useState<Species>('DOG');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [breed, setBreed] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) {
      toast({ title: t.error, description: t.petNameRequiredMsg, variant: 'destructive' });
      return;
    }
    if (!dateOfBirth) {
      toast({ title: t.error, description: t.dobRequiredPet, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/pets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pets: [{ name: name.trim(), species, dateOfBirth, breed: breed.trim() || null }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: t.error, description: String(data.error || t.error), variant: 'destructive' });
        return;
      }
      const created = data.pets?.[0] as { id: string; name: string; species: Species } | undefined;
      if (!created) {
        toast({ title: t.error, variant: 'destructive' });
        return;
      }
      onPetCreated({ id: created.id, name: created.name, species: created.species, dateOfBirth });
      toast({ title: t.petAddedSuccess, variant: 'success' });
      setName('');
      setSpecies('DOG');
      setDateOfBirth('');
      setBreed('');
      onDone?.();
    } catch (err) {
      toast({
        title: t.error,
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-gold-300 bg-gold-50/40 p-4 space-y-3">
      <p className="text-sm font-medium text-charcoal">{t.addPetForClient}</p>
      <div className="grid sm:grid-cols-5 gap-2 items-end">
        <div className="sm:col-span-2">
          <Label>{t.petName} *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </div>
        <div>
          <Label>{t.species}</Label>
          <select
            value={species}
            onChange={(e) => setSpecies(e.target.value as Species)}
            className="w-full h-10 px-3 rounded-lg border border-ivory-200 bg-white text-sm"
          >
            <option value="DOG">{t.dog}</option>
            <option value="CAT">{t.cat}</option>
          </select>
        </div>
        <div>
          <Label>{t.dobRequiredLabel}</Label>
          <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
        </div>
        <div>
          <Input
            placeholder={t.breed}
            value={breed}
            onChange={(e) => setBreed(e.target.value)}
            maxLength={60}
          />
        </div>
      </div>
      <Button type="button" size="sm" onClick={submit} disabled={saving}>
        {saving ? t.addingPet : `+ ${t.confirmAddPet}`}
      </Button>
    </div>
  );
}

/**
 * Pets section — two modes:
 *   - walk-in: editable list of free-form pets (add/remove rows)
 *   - existing client: checkbox list of the client's saved pets, with an
 *     inline "add pet" affordance (empty state + collapsible under the list)
 */
export function PetsSection({
  t,
  walkInMode,
  selectedClient,
  selectedPetIds,
  togglePet,
  walkInPets,
  setWalkInPets,
  onPetCreated,
}: Props) {
  const [showAdd, setShowAdd] = useState(false);

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
        <div className="space-y-3">
          <p className="text-sm text-gray-500">{t.noPets}</p>
          <AddPetInline t={t} clientId={selectedClient.id} onPetCreated={onPetCreated} />
        </div>
      ) : (
        <div className="space-y-2">
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
          {showAdd ? (
            <AddPetInline
              t={t}
              clientId={selectedClient.id}
              onPetCreated={onPetCreated}
              onDone={() => setShowAdd(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="text-xs text-gold-600 hover:text-gold-800 font-medium"
            >
              + {t.addPet}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
