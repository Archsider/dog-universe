'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

const KNOWN_PRODUCTS = ['NexGard', 'Simparica', 'Bravecto', 'Frontline'] as const;

function detectProductKey(product: string): string {
  if (!product) return '';
  if ((KNOWN_PRODUCTS as readonly string[]).includes(product)) return product;
  return 'OTHER';
}

type FormState = {
  name: string; species: string; breed: string; dateOfBirth: string; gender: string;
  isNeutered: string; microchipNumber: string; tattooNumber: string; weight: string;
  vetName: string; vetPhone: string;
  allergies: string; currentMedication: string;
  behaviorWithDogs: string; behaviorWithCats: string; behaviorWithHumans: string;
  notes: string;
  lastAntiparasiticDate: string;
  antiparasiticProductKey: string;    // '' | 'NexGard' | 'Simparica' | 'Bravecto' | 'Frontline' | 'OTHER'
  antiparasiticCustomProduct: string; // free text when key === 'OTHER'
  antiparasiticNotes: string;
  antiparasiticDurationDays: string;  // admin override in days (empty = use product default)
};

const EMPTY_FORM: FormState = {
  name: '', species: '', breed: '', dateOfBirth: '', gender: '',
  isNeutered: '', microchipNumber: '', tattooNumber: '', weight: '',
  vetName: '', vetPhone: '',
  allergies: '', currentMedication: '',
  behaviorWithDogs: '', behaviorWithCats: '', behaviorWithHumans: '',
  notes: '',
  lastAntiparasiticDate: '',
  antiparasiticProductKey: '',
  antiparasiticCustomProduct: '',
  antiparasiticNotes: '',
  antiparasiticDurationDays: '',
};

const BEHAVIOR_OPTIONS = [
  { value: 'SOCIABLE', fr: 'Sociable', en: 'Sociable' },
  { value: 'TOLERANT', fr: 'Tolérant', en: 'Tolerant' },
  { value: 'MONITOR', fr: 'À surveiller', en: 'Needs monitoring' },
  { value: 'REACTIVE', fr: 'Réactif', en: 'Reactive' },
];

export default function AdminEditPetPage() {
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const petId = params.id as string;
  const fr = locale === 'fr';

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }));
  const setSel = (field: keyof FormState) => (v: string) => setForm(p => ({ ...p, [field]: v }));

  useEffect(() => {
    fetch(`/api/pets/${petId}`)
      .then(r => r.json())
      .then(data => {
        setForm({
          name: data.name || '',
          species: data.species || '',
          breed: data.breed || '',
          dateOfBirth: data.dateOfBirth ? data.dateOfBirth.split('T')[0] : '',
          gender: data.gender || '',
          isNeutered: data.isNeutered === true ? 'true' : data.isNeutered === false ? 'false' : '',
          microchipNumber: data.microchipNumber || '',
          tattooNumber: data.tattooNumber || '',
          weight: data.weight !== null && data.weight !== undefined ? String(data.weight) : '',
          vetName: data.vetName || '',
          vetPhone: data.vetPhone || '',
          allergies: data.allergies || '',
          currentMedication: data.currentMedication || '',
          behaviorWithDogs: data.behaviorWithDogs || '',
          behaviorWithCats: data.behaviorWithCats || '',
          behaviorWithHumans: data.behaviorWithHumans || '',
          notes: data.notes || '',
          lastAntiparasiticDate: data.lastAntiparasiticDate ? data.lastAntiparasiticDate.split('T')[0] : '',
          antiparasiticProductKey: detectProductKey(data.antiparasiticProduct || ''),
          antiparasiticCustomProduct: detectProductKey(data.antiparasiticProduct || '') === 'OTHER' ? (data.antiparasiticProduct || '') : '',
          antiparasiticNotes: data.antiparasiticNotes || '',
          antiparasiticDurationDays: data.antiparasiticDurationDays ? String(data.antiparasiticDurationDays) : '',
        });
        setFetching(false);
      })
      .catch(() => setFetching(false));
  }, [petId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.species || !form.dateOfBirth) {
      toast({ title: fr ? 'Nom, espèce et date de naissance sont obligatoires' : 'Name, species and date of birth are required', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const antiparasiticProduct = form.antiparasiticProductKey === 'OTHER'
        ? (form.antiparasiticCustomProduct.trim() || null)
        : (form.antiparasiticProductKey || null);

      const { antiparasiticProductKey: _k, antiparasiticCustomProduct: _c, ...rest } = form;
      const payload = {
        ...rest,
        isNeutered: form.isNeutered === '' ? null : form.isNeutered === 'true',
        weight: form.weight ? parseFloat(form.weight) : null,
        lastAntiparasiticDate: form.lastAntiparasiticDate || null,
        antiparasiticProduct,
        antiparasiticDurationDays: form.antiparasiticDurationDays ? parseInt(form.antiparasiticDurationDays, 10) : null,
      };

      const res = await fetch(`/api/pets/${petId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast({ title: fr ? 'Animal modifié !' : 'Pet updated!', variant: 'success' });
        router.push(`/${locale}/admin/animals/${petId}`);
      } else {
        throw new Error('Failed');
      }
    } catch {
      toast({ title: fr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/${locale}/admin/animals/${petId}`} className="text-charcoal/50 hover:text-charcoal">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-serif font-bold text-charcoal">
          {fr ? "Modifier l'animal" : 'Edit pet'}
        </h1>
      </div>

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-8 shadow-card">
        <form onSubmit={handleSubmit} className="space-y-8">

          {/* Identité */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-charcoal/60 uppercase tracking-wide border-b pb-2">
              {fr ? 'Identité' : 'Identity'}
            </h3>

            <div>
              <Label htmlFor="name">{fr ? 'Nom' : 'Name'} *</Label>
              <Input id="name" value={form.name} onChange={set('name')} required className="mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{fr ? 'Espèce' : 'Species'} *</Label>
                <Select value={form.species} onValueChange={setSel('species')}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={fr ? 'Choisir' : 'Choose'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DOG">{fr ? 'Chien' : 'Dog'}</SelectItem>
                    <SelectItem value="CAT">{fr ? 'Chat' : 'Cat'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{fr ? 'Sexe' : 'Gender'}</Label>
                <Select value={form.gender} onValueChange={setSel('gender')}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={fr ? 'Sexe' : 'Gender'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">{fr ? 'Mâle' : 'Male'}</SelectItem>
                    <SelectItem value="FEMALE">{fr ? 'Femelle' : 'Female'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="breed">{fr ? 'Race' : 'Breed'}</Label>
                <Input id="breed" value={form.breed} onChange={set('breed')} className="mt-1" placeholder="Golden Retriever..." />
              </div>
              <div>
                <Label htmlFor="dob">{fr ? 'Date de naissance' : 'Date of birth'} *</Label>
                <Input id="dob" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} required className="mt-1" max={new Date().toISOString().split('T')[0]} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="weight">{fr ? 'Poids (kg)' : 'Weight (kg)'}</Label>
                <Input id="weight" type="number" min="0" step="0.1" value={form.weight} onChange={set('weight')} className="mt-1" placeholder="4.5" />
              </div>
              <div>
                <Label>{fr ? 'Statut reproductif' : 'Reproductive status'}</Label>
                <Select value={form.isNeutered} onValueChange={setSel('isNeutered')}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={fr ? 'Choisir' : 'Choose'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">{fr ? 'Stérilisé(e) / Castré(e)' : 'Neutered / Spayed'}</SelectItem>
                    <SelectItem value="false">{fr ? 'Non stérilisé(e)' : 'Not neutered'}</SelectItem>
                  </SelectContent>
                </Select>
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

          {/* Vétérinaire */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-charcoal/60 uppercase tracking-wide border-b pb-2">
              {fr ? 'Vétérinaire' : 'Veterinarian'}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="vetName">{fr ? 'Nom du vétérinaire' : 'Vet name'}</Label>
                <Input id="vetName" value={form.vetName} onChange={set('vetName')} className="mt-1" placeholder="Dr. Benali" />
              </div>
              <div>
                <Label htmlFor="vetPhone">{fr ? 'Téléphone vétérinaire' : 'Vet phone'}</Label>
                <Input id="vetPhone" value={form.vetPhone} onChange={set('vetPhone')} className="mt-1" placeholder="+212 6 00 00 00 00" />
              </div>
            </div>
          </section>

          {/* Santé */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-charcoal/60 uppercase tracking-wide border-b pb-2">
              {fr ? 'Santé' : 'Health'}
            </h3>
            <div>
              <Label htmlFor="allergies">{fr ? 'Allergies / Conditions médicales' : 'Allergies / Medical conditions'}</Label>
              <Textarea id="allergies" value={form.allergies} onChange={set('allergies')} className="mt-1" rows={2} />
            </div>
            <div>
              <Label htmlFor="medication">{fr ? 'Médication en cours' : 'Current medication'}</Label>
              <Textarea id="medication" value={form.currentMedication} onChange={set('currentMedication')} className="mt-1" rows={2} />
            </div>
          </section>

          {/* Comportement */}
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
                <Label>{label}</Label>
                <Select value={form[field]} onValueChange={setSel(field)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={fr ? 'Choisir' : 'Choose'} />
                  </SelectTrigger>
                  <SelectContent>
                    {BEHAVIOR_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{fr ? o.fr : o.en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </section>

          {/* Antiparasitaire */}
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
                <Label>{fr ? 'Produit utilisé' : 'Product used'}</Label>
                <Select value={form.antiparasiticProductKey} onValueChange={v => setForm(p => ({ ...p, antiparasiticProductKey: v, antiparasiticCustomProduct: v !== 'OTHER' ? '' : p.antiparasiticCustomProduct }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={fr ? 'Choisir' : 'Choose'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{fr ? '— Non renseigné' : '— Not specified'}</SelectItem>
                    <SelectItem value="NexGard">NexGard (30j)</SelectItem>
                    <SelectItem value="Simparica">Simparica (30j)</SelectItem>
                    <SelectItem value="Bravecto">Bravecto (84j)</SelectItem>
                    <SelectItem value="Frontline">Frontline (30j)</SelectItem>
                    <SelectItem value="OTHER">{fr ? 'Autre…' : 'Other…'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.antiparasiticProductKey === 'OTHER' && (
              <div>
                <Label htmlFor="antiCustom">{fr ? 'Nom du produit' : 'Product name'}</Label>
                <Input id="antiCustom" value={form.antiparasiticCustomProduct} onChange={set('antiparasiticCustomProduct')} className="mt-1" placeholder={fr ? 'Ex: Seresto, Advantix...' : 'Ex: Seresto, Advantix...'} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="antiDuration">
                  {fr ? 'Durée protection (jours, optionnel)' : 'Protection duration (days, optional)'}
                </Label>
                <Input
                  id="antiDuration"
                  type="number"
                  min="1"
                  max="365"
                  value={form.antiparasiticDurationDays}
                  onChange={set('antiparasiticDurationDays')}
                  className="mt-1"
                  placeholder={fr ? 'Ex: 30, 84… (remplace la valeur par défaut)' : 'Ex: 30, 84… (overrides default)'}
                />
              </div>
              <div>
                <Label htmlFor="antiNotes">{fr ? 'Notes (optionnel)' : 'Notes (optional)'}</Label>
                <Textarea id="antiNotes" value={form.antiparasiticNotes} onChange={set('antiparasiticNotes')} className="mt-1" rows={2} />
              </div>
            </div>
          </section>

          {/* Notes spéciales */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-charcoal/60 uppercase tracking-wide border-b pb-2">
              {fr ? 'Notes spéciales' : 'Special notes'}
            </h3>
            <div>
              <Textarea id="notes" value={form.notes} onChange={set('notes')} className="mt-1" rows={3} />
            </div>
          </section>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" asChild className="flex-1">
              <Link href={`/${locale}/admin/animals/${petId}`}>{fr ? 'Annuler' : 'Cancel'}</Link>
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {fr ? 'Enregistrer' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
