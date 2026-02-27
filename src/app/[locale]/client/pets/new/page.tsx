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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

export default function NewPetPage() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('pets');

  const [form, setForm] = useState({
    name: '', species: '', breed: '', dateOfBirth: '', gender: '', notes: '',
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    if (!form.name || !form.species) {
      toast({ title: locale === 'fr' ? 'Champs manquants' : 'Missing fields', variant: 'destructive' });
      return;
    }
    setLoading(true);

    try {
      let photoUrl: string | null = null;

      // Upload photo if provided
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

      const res = await fetch('/api/pets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, photoUrl }),
      });

      if (res.ok) {
        toast({
          title: locale === 'fr' ? 'Animal ajouté !' : 'Pet added!',
          variant: 'success',
        });
        router.push(`/${locale}/client/pets`);
      } else {
        throw new Error('Failed to create pet');
      }
    } catch {
      toast({ title: locale === 'fr' ? 'Erreur' : 'Error', variant: 'destructive' });
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
        <div>
          <h1 className="text-2xl font-serif font-bold text-charcoal">{t('addPet')}</h1>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-8 shadow-card">
        <form onSubmit={handleSubmit} className="space-y-5">
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

          {/* Name */}
          <div>
            <Label htmlFor="name">{t('form.name')} *</Label>
            <Input id="name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required className="mt-1" placeholder="Max" />
          </div>

          {/* Species */}
          <div>
            <Label>{t('form.species')} *</Label>
            <Select value={form.species} onValueChange={(v) => setForm((p) => ({ ...p, species: v }))}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={locale === 'fr' ? 'Choisir une espèce' : 'Choose species'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DOG">{t('form.speciesOptions.DOG')}</SelectItem>
                <SelectItem value="CAT">{t('form.speciesOptions.CAT')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Breed */}
          <div>
            <Label htmlFor="breed">{t('form.breed')}</Label>
            <Input id="breed" value={form.breed} onChange={(e) => setForm((p) => ({ ...p, breed: e.target.value }))}
              className="mt-1" placeholder={locale === 'fr' ? 'Golden Retriever, Persan...' : 'Golden Retriever, Persian...'} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Date of birth */}
            <div>
              <Label htmlFor="dob">{t('form.dateOfBirth')}</Label>
              <Input id="dob" type="date" value={form.dateOfBirth}
                onChange={(e) => setForm((p) => ({ ...p, dateOfBirth: e.target.value }))}
                className="mt-1" max={new Date().toISOString().split('T')[0]} />
            </div>

            {/* Gender */}
            <div>
              <Label>{t('form.gender')}</Label>
              <Select value={form.gender} onValueChange={(v) => setForm((p) => ({ ...p, gender: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={locale === 'fr' ? 'Sexe' : 'Gender'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">{t('form.genderOptions.MALE')}</SelectItem>
                  <SelectItem value="FEMALE">{t('form.genderOptions.FEMALE')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">{t('form.notes')}</Label>
            <Textarea id="notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className="mt-1" placeholder={locale === 'fr' ? 'Régime alimentaire, médicaments, comportement...' : 'Diet, medications, behavior...'} rows={3} />
          </div>

          <div className="flex gap-3 pt-2">
            <Link href={`/${locale}/client/pets`} className="flex-1">
              <Button type="button" variant="outline" className="w-full">
                {locale === 'fr' ? 'Annuler' : 'Cancel'}
              </Button>
            </Link>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {locale === 'fr' ? 'Enregistrer' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
