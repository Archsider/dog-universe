'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Loader2, Upload, PawPrint } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';

const BEHAVIOR_OPTIONS = [
  { value: 'SOCIABLE', fr: 'Sociable', en: 'Sociable' },
  { value: 'TOLERANT', fr: 'Tolérant', en: 'Tolerant' },
  { value: 'MONITOR', fr: 'À surveiller', en: 'Needs monitoring' },
  { value: 'REACTIVE', fr: 'Réactif', en: 'Reactive' },
];

const SELECT_CLASS = 'mt-1 block w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

type FormState = {
  name: string; species: string; breed: string; dateOfBirth: string; gender: string;
  isNeutered: string; microchipNumber: string; tattooNumber: string; weight: string;
  vetName: string; vetPhone: string;
  allergies: string; currentMedication: string;
  behaviorWithDogs: string; behaviorWithCats: string; behaviorWithHumans: string;
  notes: string;
  lastAntiparasiticDate: string; antiparasiticProduct: string; antiparasiticNotes: string;
};

export default function NewPetPage() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('pets');
  const fr = locale === 'fr';

  const [form, setForm] = useState<FormState>({
    name: '', species: '', breed: '', dateOfBirth: '', gender: '',
    isNeutered: '', microchipNumber: '', tattooNumber: '', weight: '',
    vetName: '', vetPhone: '',
    allergies: '', currentMedication: '',
    behaviorWithDogs: '', behaviorWithCats: '', behaviorWithHumans: '',
    notes: '',
    lastAntiparasiticDate: '', antiparasiticProduct: '', antiparasiticNotes: '',
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }));
  const setSel = (field: keyof FormState) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }));

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.species || !form.dateOfBirth) {
      toast({ title: fr ? 'Nom, espèce et date de naissance sont obligatoires' : 'Name, species and date of birth are required', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        const formData = new FormData();
        formData.append('file', photoFile);
        formData.append('type', 'pet-photo');
        const uploadRes = await fetch('/api/uploads', { method: 'POST', body: formData });
        if (uploadRes.ok) photoUrl = (await uploadRes.json()).url;
      }

      const payload = {
        ...form,
        photoUrl,
        isNeutered: form.isNeutered === '' ? null : form.isNeutered === 'true',
        weight: form.weight ? parseFloat(form.weight) : null,
        lastAntiparasiticDate: form.lastAntiparasiticDate || null,
      };

      const res = await fetch('/api/pets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast({ title: fr ? 'Animal ajouté !' : 'Pet added!', variant: 'success' });
        router.push(`/${locale}/client/pets`);
      } else {
        throw new Error('Failed');
      }
    } catch {
      toast({ title: fr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/${locale}/client/pets`} className="text-charcoal/50 hover:text-charcoal">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-serif font-bold text-charcoal">{t('addPet')}</h1>
      </div>

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-8 shadow-card">
        <form onSubmit={handleSubmit} className="space-y-8">

          {/* Photo */}
          <div>
            <Label>{t('form.photo')}</Label>
            <div className="mt-2 flex items-center gap-4">
              <div className="h-20 w-20 rounded-full bg-gold-50 border-2 border-gold-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                {photoPreview ? (
                  <img src={photoPreview} alt="Preview" className="h-20 w-20 rounded-full object-cover" />
                ) : (
                  <PawPrint className="h-8 w-8 text-gold-300" />
                )}
              </div>
              <label className="cursor-pointer flex items-center gap-2 text-sm text-gold-600 hover:text-gold-700 border border-gold-300 rounded-md px-3 py-2 transition-colors">
                <Upload className="h-4 w-4" />
                {photoPreview ? t('form.changePhoto') : t('form.uploadPhoto')}
                <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
              </label>
            </div>
          </div>

          {/* Section 1 : Identité */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-charcoal/60 uppercase tracking-wide border-b pb-2">
              {fr ? 'Identité' : 'Identity'}
            </h3>

            <div>
              <Label htmlFor="name">{t('form.name')} *</Label>
              <Input id="name" value={form.name} onChange={set('name')} required className="mt-1" placeholder="Max" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="species">{t('form.species')} *</Label>
                <select id="species" value={form.species} onChange={setSel('species')} className={SELECT_CLASS}>
                  <option value="" disabled>{fr ? 'Choisir' : 'Choose'}</option>
                  <option value="DOG">{t('form.speciesOptions.DOG')}</option>
                  <option value="CAT">{t('form.speciesOptions.CAT')}</option>
                </select>
              </div>
              <div>
                <Label htmlFor="gender">{t('form.gender')}</Label>
                <select id="gender" value={form.gender} onChange={setSel('gender')} className={SELECT_CLASS}>
                  <option value="" disabled>{fr ? 'Sexe' : 'Gender'}</option>
                  <option value="MALE">{t('form.genderOptions.MALE')}</option>
                  <option value="FEMALE">{t('form.genderOptions.FEMALE')}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="breed">{t('form.breed')}</Label>
                <Input id="breed" value={form.breed} onChange={set('breed')} className="mt-1" placeholder={fr ? 'Golden Retriever...' : 'Golden Retriever...'} />
              </div>
              <div>
                <Label htmlFor="dob">{t('form.dateOfBirth')} *</Label>
                <Input id="dob" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} required className="mt-1" max={new Date().toISOString().split('T')[0]} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="weight">{fr ? 'Poids (kg)' : 'Weight (kg)'}</Label>
                <Input id="weight" type="number" min="0" step="0.1" value={form.weight} onChange={set('weight')} className="mt-1" placeholder="4.5" />
              </div>
              <div>
                <Label htmlFor="isNeutered">{fr ? 'Statut reproductif' : 'Reproductive status'}</Label>
                <select id="isNeutered" value={form.isNeutered} onChange={setSel('isNeutered')} className={SELECT_CLASS}>
                  <option value="" disabled>{fr ? 'Choisir' : 'Choose'}</option>
                  <option value="true">{fr ? 'Stérilisé(e) / Castré(e)' : 'Neutered / Spayed'}</option>
                  <option value="false">{fr ? 'Non stérilisé(e)' : 'Not neutered'}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="microchip">{fr ? 'N° de puce électronique' : 'Microchip number'}</Label>
                <Input id="microchip" value={form.microchipNumber} onChange={set('microchipNumber')} className="mt-1" placeholder="250268500000000" />
              </div>
              <div>
                <Label htmlFor="tattoo">{fr ? 'N° de tatouage' : 'Tattoo number'}</Label>
                <Input id="tattoo" value={form.tattooNumber} onChange={set('tattooNumber')} className="mt-1" placeholder="ABC123" />
              </div>
            </div>
          </section>

          {/* Section 2 : Vétérinaire */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-charcoal/60 uppercase tracking-wide border-b pb-2">
              {fr ? 'Vétérinaire' : 'Veterinarian'}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="vetName">{fr ? 'Nom du vétérinaire' : 'Vet name'}</Label>
                <Input id="vetName" value={form.vetName} onChange={set('vetName')} className="mt-1" placeholder="Dr. Martin" />
              </div>
              <div>
                <Label htmlFor="vetPhone">{fr ? 'Téléphone vétérinaire' : 'Vet phone'}</Label>
                <Input id="vetPhone" value={form.vetPhone} onChange={set('vetPhone')} className="mt-1" placeholder="+212 6 00 00 00 00" />
              </div>
            </div>
          </section>

          {/* Section 3 : Santé */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-charcoal/60 uppercase tracking-wide border-b pb-2">
              {fr ? 'Santé' : 'Health'}
            </h3>
            <div>
              <Label htmlFor="allergies">{fr ? 'Allergies / Conditions médicales' : 'Allergies / Medical conditions'}</Label>
              <Textarea id="allergies" value={form.allergies} onChange={set('allergies')} className="mt-1" placeholder={fr ? 'Ex: allergie au poulet, dermatite...' : 'Ex: chicken allergy, dermatitis...'} rows={2} />
            </div>
            <div>
              <Label htmlFor="medication">{fr ? 'Médication en cours' : 'Current medication'}</Label>
              <Textarea id="medication" value={form.currentMedication} onChange={set('currentMedication')} className="mt-1" placeholder={fr ? 'Ex: Apoquel 5mg, 1 cp/jour...' : 'Ex: Apoquel 5mg, 1 tab/day...'} rows={2} />
            </div>
          </section>

          {/* Section 4 : Comportement */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-charcoal/60 uppercase tracking-wide border-b pb-2">
              {fr ? 'Comportement' : 'Behavior'}
            </h3>
            {[
              { field: 'behaviorWithDogs' as const, label: fr ? 'Avec les chiens' : 'With dogs' },
              { field: 'behaviorWithCats' as const, label: fr ? 'Avec les chats' : 'With cats' },
              { field: 'behaviorWithHumans' as const, label: fr ? 'Avec les humains' : 'With humans' },
            ].map(({ field, label }) => (
              <div key={field}>
                <Label htmlFor={field}>{label}</Label>
                <select id={field} value={form[field]} onChange={setSel(field)} className={SELECT_CLASS}>
                  <option value="" disabled>{fr ? 'Choisir' : 'Choose'}</option>
                  {BEHAVIOR_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{fr ? o.fr : o.en}</option>
                  ))}
                </select>
              </div>
            ))}
          </section>

          {/* Section 5 : Antiparasitaire */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-charcoal/60 uppercase tracking-wide border-b pb-2">
              {fr ? 'Antiparasitaire' : 'Anti-parasitic treatment'}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="antiDate">{fr ? 'Dernière application' : 'Last treatment date'}</Label>
                <Input id="antiDate" type="date" value={form.lastAntiparasiticDate} onChange={set('lastAntiparasiticDate')} className="mt-1" max={new Date().toISOString().split('T')[0]} />
              </div>
              <div>
                <Label htmlFor="antiProduct">{fr ? 'Produit utilisé' : 'Product used'}</Label>
                <Input id="antiProduct" value={form.antiparasiticProduct} onChange={set('antiparasiticProduct')} className="mt-1" placeholder={fr ? 'Ex: Frontline, Bravecto...' : 'Ex: Frontline, Bravecto...'} />
              </div>
            </div>
            <div>
              <Label htmlFor="antiNotes">{fr ? 'Notes (optionnel)' : 'Notes (optional)'}</Label>
              <Textarea id="antiNotes" value={form.antiparasiticNotes} onChange={set('antiparasiticNotes')} className="mt-1" placeholder={fr ? 'Ex: traitement mensuel, réaction passée...' : 'Ex: monthly treatment, past reaction...'} rows={2} />
            </div>
          </section>

          {/* Section 6 : Notes */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-charcoal/60 uppercase tracking-wide border-b pb-2">
              {fr ? 'Notes spéciales' : 'Special notes'}
            </h3>
            <div>
              <Label htmlFor="notes">{fr ? 'Instructions particulières' : 'Special instructions'}</Label>
              <Textarea id="notes" value={form.notes} onChange={set('notes')} className="mt-1" placeholder={fr ? 'Régime alimentaire, habitudes, instructions spécifiques...' : 'Diet, habits, specific instructions...'} rows={3} />
            </div>
          </section>

          <div className="flex gap-3 pt-2">
            <Link href={`/${locale}/client/pets`} className="flex-1">
              <Button type="button" variant="outline" className="w-full">
                {fr ? 'Annuler' : 'Cancel'}
              </Button>
            </Link>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {fr ? 'Enregistrer' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
