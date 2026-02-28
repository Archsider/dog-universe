'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2, PawPrint } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Client { id: string; name: string; email: string }

interface Props {
  locale: string;
  defaultOwnerId?: string;
}

export default function CreateAnimalModal({ locale, defaultOwnerId }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [form, setForm] = useState({
    ownerId: defaultOwnerId ?? '',
    name: '',
    species: 'DOG',
    breed: '',
    gender: '',
    dateOfBirth: '',
  });
  const [error, setError] = useState('');
  const router = useRouter();

  const l = locale === 'en'
    ? { btn: 'New animal', title: 'Add an animal', owner: 'Owner', name: 'Name', species: 'Species', breed: 'Breed (optional)', gender: 'Gender (optional)', dob: 'Date of birth (optional)', dog: 'Dog', cat: 'Cat', male: 'Male', female: 'Female', none: '—', cancel: 'Cancel', create: 'Add', success: 'Animal added', errMissing: 'Required fields missing', selectOwner: 'Select owner...' }
    : { btn: 'Nouvel animal', title: 'Ajouter un animal', owner: 'Propriétaire', name: 'Nom', species: 'Espèce', breed: 'Race (optionnel)', gender: 'Sexe (optionnel)', dob: 'Date de naissance (optionnel)', dog: 'Chien', cat: 'Chat', male: 'Mâle', female: 'Femelle', none: '—', cancel: 'Annuler', create: 'Ajouter', success: 'Animal ajouté', errMissing: 'Champs requis manquants', selectOwner: 'Choisir un propriétaire...' };

  const openModal = async () => {
    setOpen(true);
    if (!defaultOwnerId && clients.length === 0) {
      setLoadingClients(true);
      try {
        const res = await fetch('/api/admin/clients?limit=200');
        const data = await res.json();
        setClients(data.clients ?? []);
      } finally {
        setLoadingClients(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/animals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setError(l.errMissing);
        return;
      }
      toast({ title: l.success, variant: 'success' });
      setOpen(false);
      setForm({ ownerId: defaultOwnerId ?? '', name: '', species: 'DOG', breed: '', gender: '', dateOfBirth: '' });
      router.refresh();
    } catch {
      setError(l.errMissing);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-2 px-4 py-2 bg-charcoal text-white rounded-lg text-sm font-medium hover:bg-charcoal/90 transition-colors"
      >
        <PawPrint className="h-4 w-4" />
        {l.btn}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-serif font-bold text-charcoal">{l.title}</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-charcoal">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!defaultOwnerId && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{l.owner} *</label>
                  {loadingClients ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Chargement...</div>
                  ) : (
                    <select
                      required
                      value={form.ownerId}
                      onChange={e => setForm(f => ({ ...f, ownerId: e.target.value }))}
                      className="w-full px-3 py-2 border border-ivory-200 rounded-lg text-sm focus:outline-none focus:border-gold-400 bg-white"
                    >
                      <option value="">{l.selectOwner}</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name} — {c.email}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{l.name} *</label>
                <input
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-ivory-200 rounded-lg text-sm focus:outline-none focus:border-gold-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{l.species} *</label>
                  <select
                    value={form.species}
                    onChange={e => setForm(f => ({ ...f, species: e.target.value }))}
                    className="w-full px-3 py-2 border border-ivory-200 rounded-lg text-sm focus:outline-none focus:border-gold-400 bg-white"
                  >
                    <option value="DOG">{l.dog}</option>
                    <option value="CAT">{l.cat}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{l.gender}</label>
                  <select
                    value={form.gender}
                    onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
                    className="w-full px-3 py-2 border border-ivory-200 rounded-lg text-sm focus:outline-none focus:border-gold-400 bg-white"
                  >
                    <option value="">{l.none}</option>
                    <option value="MALE">{l.male}</option>
                    <option value="FEMALE">{l.female}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{l.breed}</label>
                <input
                  value={form.breed}
                  onChange={e => setForm(f => ({ ...f, breed: e.target.value }))}
                  className="w-full px-3 py-2 border border-ivory-200 rounded-lg text-sm focus:outline-none focus:border-gold-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{l.dob}</label>
                <input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                  className="w-full px-3 py-2 border border-ivory-200 rounded-lg text-sm focus:outline-none focus:border-gold-400"
                />
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 px-4 py-2 border border-ivory-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-ivory-50"
                >
                  {l.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-charcoal text-white rounded-lg text-sm font-medium hover:bg-charcoal/90 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {l.create}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
