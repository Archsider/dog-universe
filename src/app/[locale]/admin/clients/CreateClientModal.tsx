'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2, UserPlus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  locale: string;
}

export default function CreateClientModal({ locale }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', language: 'fr' });
  const [error, setError] = useState('');
  const router = useRouter();

  const l = locale === 'en'
    ? { btn: 'New client', title: 'Create client', name: 'Full name', email: 'Email', phone: 'Phone (optional)', password: 'Temporary password', lang: 'Language', cancel: 'Cancel', create: 'Create', success: 'Client created', errTaken: 'Email already in use', errWeak: 'Password must be 8+ characters', errMissing: 'Required fields missing' }
    : { btn: 'Nouveau client', title: 'Créer un client', name: 'Nom complet', email: 'Email', phone: 'Téléphone (optionnel)', password: 'Mot de passe temporaire', lang: 'Langue', cancel: 'Annuler', create: 'Créer', success: 'Client créé', errTaken: 'Email déjà utilisé', errWeak: 'Mot de passe trop court (8 min)', errMissing: 'Champs requis manquants' };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'EMAIL_TAKEN') setError(l.errTaken);
        else if (data.error === 'WEAK_PASSWORD') setError(l.errWeak);
        else setError(l.errMissing);
        return;
      }
      toast({ title: l.success, variant: 'success' });
      setOpen(false);
      setForm({ name: '', email: '', phone: '', password: '', language: 'fr' });
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
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-charcoal text-white rounded-lg text-sm font-medium hover:bg-charcoal/90 transition-colors"
      >
        <UserPlus className="h-4 w-4" />
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
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{l.name} *</label>
                <input
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-ivory-200 rounded-lg text-sm focus:outline-none focus:border-gold-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{l.email} *</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-ivory-200 rounded-lg text-sm focus:outline-none focus:border-gold-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{l.phone}</label>
                <input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-ivory-200 rounded-lg text-sm focus:outline-none focus:border-gold-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{l.password} *</label>
                <input
                  required
                  type="text"
                  minLength={8}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full px-3 py-2 border border-ivory-200 rounded-lg text-sm focus:outline-none focus:border-gold-400 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{l.lang}</label>
                <select
                  value={form.language}
                  onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
                  className="w-full px-3 py-2 border border-ivory-200 rounded-lg text-sm focus:outline-none focus:border-gold-400 bg-white"
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
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
