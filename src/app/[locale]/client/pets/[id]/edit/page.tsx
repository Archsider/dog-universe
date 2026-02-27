'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import { ArrowLeft, Loader2, Upload, PawPrint } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

interface PetData {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  notes: string | null;
  photoUrl: string | null;
}

export default function EditPetPage() {
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const petId = params.id as string;

  const [pet, setPet] = useState<PetData | null>(null);
  const [form, setForm] = useState({ name: '', species: '', breed: '', dateOfBirth: '', gender: '', notes: '' });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const labels = {
    fr: {
      title: 'Modifier l\'animal',
      back: 'Retour',
      photo: 'Photo',
      name: 'Nom',
      species: 'Espèce',
      breed: 'Race',
      dob: 'Date de naissance',
      gender: 'Sexe',
      notes: 'Notes',
      save: 'Enregistrer',
      cancel: 'Annuler',
      saving: 'Enregistrement...',
      uploadPhoto: 'Changer la photo',
      dog: 'Chien',
      cat: 'Chat',
      male: 'Mâle',
      female: 'Femelle',
      chooseSpecies: 'Choisir une espèce',
      chooseGender: 'Sexe',
      notesPlaceholder: 'Régime alimentaire, médicaments, comportement...',
      breedPlaceholder: 'Golden Retriever, Persan...',
      success: 'Animal modifié !',
      error: 'Erreur',
    },
    en: {
      title: 'Edit pet',
      back: 'Back',
      photo: 'Photo',
      name: 'Name',
      species: 'Species',
      breed: 'Breed',
      dob: 'Date of birth',
      gender: 'Gender',
      notes: 'Notes',
      save: 'Save',
      cancel: 'Cancel',
      saving: 'Saving...',
      uploadPhoto: 'Change photo',
      dog: 'Dog',
      cat: 'Cat',
      male: 'Male',
      female: 'Female',
      chooseSpecies: 'Choose species',
      chooseGender: 'Gender',
      notesPlaceholder: 'Diet, medications, behavior...',
      breedPlaceholder: 'Golden Retriever, Persian...',
      success: 'Pet updated!',
      error: 'Error',
    },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;

  useEffect(() => {
    fetch(`/api/pets/${petId}`)
      .then(r => r.json())
      .then(data => {
        setPet(data);
        setForm({
          name: data.name || '',
          species: data.species || '',
          breed: data.breed || '',
          dateOfBirth: data.dateOfBirth ? data.dateOfBirth.split('T')[0] : '',
          gender: data.gender || '',
          notes: data.notes || '',
        });
        setPhotoPreview(data.photoUrl || null);
        setFetching(false);
      })
      .catch(() => setFetching(false));
  }, [petId]);

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
    if (!form.name || !form.species) return;
    setLoading(true);
    try {
      let photoUrl = pet?.photoUrl ?? null;
      if (photoFile) {
        const formData = new FormData();
        formData.append('file', photoFile);
        formData.append('type', 'pet-photo');
        const uploadRes = await fetch('/api/uploads', { method: 'POST', body: formData });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          photoUrl = uploadData.url;
        }
      }
      const res = await fetch(`/api/pets/${petId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, photoUrl }),
      });
      if (res.ok) {
        toast({ title: l.success, variant: 'success' });
        router.push(`/${locale}/client/pets/${petId}`);
      } else {
        throw new Error('Failed');
      }
    } catch {
      toast({ title: l.error, variant: 'destructive' });
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
        <Link href={`/${locale}/client/pets/${petId}`} className="text-charcoal/50 hover:text-charcoal">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
      </div>

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-8 shadow-card">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Photo */}
          <div>
            <Label>{l.photo}</Label>
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
                {l.uploadPhoto}
                <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
              </label>
            </div>
          </div>

          <div>
            <Label htmlFor="name">{l.name} *</Label>
            <Input id="name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className="mt-1" />
          </div>

          <div>
            <Label>{l.species} *</Label>
            <Select value={form.species} onValueChange={v => setForm(p => ({ ...p, species: v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder={l.chooseSpecies} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DOG">{l.dog}</SelectItem>
                <SelectItem value="CAT">{l.cat}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="breed">{l.breed}</Label>
            <Input id="breed" value={form.breed} onChange={e => setForm(p => ({ ...p, breed: e.target.value }))} className="mt-1" placeholder={l.breedPlaceholder} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="dob">{l.dob}</Label>
              <Input id="dob" type="date" value={form.dateOfBirth} onChange={e => setForm(p => ({ ...p, dateOfBirth: e.target.value }))} className="mt-1" max={new Date().toISOString().split('T')[0]} />
            </div>
            <div>
              <Label>{l.gender}</Label>
              <Select value={form.gender} onValueChange={v => setForm(p => ({ ...p, gender: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={l.chooseGender} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">{l.male}</SelectItem>
                  <SelectItem value="FEMALE">{l.female}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="notes">{l.notes}</Label>
            <Textarea id="notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="mt-1" placeholder={l.notesPlaceholder} rows={3} />
          </div>

          <div className="flex gap-3 pt-2">
            <Link href={`/${locale}/client/pets/${petId}`} className="flex-1">
              <Button type="button" variant="outline" className="w-full">{l.cancel}</Button>
            </Link>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {loading ? l.saving : l.save}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
