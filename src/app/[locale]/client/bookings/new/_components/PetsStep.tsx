'use client';

import Image from 'next/image';
import Link from 'next/link';
import { AlertCircle, Check, Loader2, PawPrint } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Pet } from '../_lib/types';
import type { WizardLabels } from '../_lib/i18n';

interface Props {
  pets: Pet[];
  loadingPets: boolean;
  petsError: string | null;
  selectedPets: string[];
  togglePet: (id: string) => void;
  reloadPets: () => void;
  locale: string;
  l: WizardLabels;
}

export function PetsStep({ pets, loadingPets, petsError, selectedPets, togglePet, reloadPets, locale, l }: Props) {
  return (
    <div>
      {loadingPets ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gold-500" /></div>
      ) : petsError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-red-800 mb-3">{petsError}</p>
            <Button variant="outline" size="sm" onClick={reloadPets}>
              {l.retry}
            </Button>
          </div>
        </div>
      ) : pets.length === 0 ? (
        <div className="text-center py-8">
          <PawPrint className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 mb-4">{l.noPets}</p>
          <Link href={`/${locale}/client/pets/new`}>
            <Button variant="outline">{l.addPet}</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 mb-4">{l.selectPets}</p>
          {pets.map(pet => (
            <button
              key={pet.id}
              onClick={() => togglePet(pet.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                selectedPets.includes(pet.id) ? 'border-gold-400 bg-gold-50' : 'border-ivory-200 hover:border-gold-200'
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-gold-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                {pet.photoUrl ? (
                  <Image src={pet.photoUrl} alt={pet.name} width={48} height={48} className="w-12 h-12 object-cover" />
                ) : (
                  <PawPrint className="h-6 w-6 text-gold-400" />
                )}
              </div>
              <div className="flex-1">
                <div className="font-medium text-charcoal">{pet.name}</div>
                <div className="text-sm text-gray-500">{pet.breed || pet.species}</div>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                selectedPets.includes(pet.id) ? 'border-gold-500 bg-gold-500' : 'border-gray-300'
              }`}>
                {selectedPets.includes(pet.id) && <Check className="h-3 w-3 text-white" />}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
