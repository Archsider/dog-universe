'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, UserPlus, Trash2, Crown } from 'lucide-react';

interface Admin {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export function AdminsClient({ currentUserId }: { currentUserId: string }) {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', password: '', language: 'fr' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { fetchAdmins(); }, []);

  async function fetchAdmins() {
    setLoading(true);
    const res = await fetch('/api/admin/admins');
    if (res.ok) {
      const data = await res.json();
      setAdmins(data.admins);
    }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    const res = await fetch('/api/admin/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error === 'EMAIL_TAKEN' ? 'Email déjà utilisé par un autre admin.' : data.error ?? 'Erreur');
    } else {
      setSuccess(`Admin ${data.name} ajouté avec succès.`);
      setForm({ name: '', email: '', password: '', language: 'fr' });
      fetchAdmins();
    }
    setSubmitting(false);
  }

  async function handleRemove(id: string, name: string) {
    if (!confirm(`Rétrograder ${name} en CLIENT ?`)) return;
    const res = await fetch(`/api/admin/admins/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error === 'CANNOT_DEMOTE_SUPERADMIN' ? 'Impossible de rétrograder un Super Admin.' : data.error ?? 'Erreur');
    } else {
      fetchAdmins();
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-charcoal flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-gold-600" />
          Gestion des admins
        </h1>
        <p className="text-sm text-gray-500 mt-1">Ajouter ou retirer des administrateurs. Réservé au Super Admin.</p>
      </div>

      {/* Current admins list */}
      <div className="bg-white rounded-xl border border-ivory-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-ivory-100">
          <h2 className="font-semibold text-charcoal">Administrateurs actifs</h2>
        </div>
        {loading ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">Chargement…</div>
        ) : (
          <ul className="divide-y divide-ivory-100">
            {admins.map((admin) => (
              <li key={admin.id} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  {admin.role === 'SUPERADMIN' ? (
                    <Crown className="h-5 w-5 text-gold-500 flex-shrink-0" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-blue-500 flex-shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-charcoal">{admin.name}</p>
                    <p className="text-xs text-gray-500">{admin.email}</p>
                  </div>
                  <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    admin.role === 'SUPERADMIN'
                      ? 'bg-gold-50 text-gold-700 border border-gold-200'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}>
                    {admin.role === 'SUPERADMIN' ? 'Super Admin' : 'Admin'}
                  </span>
                </div>
                {admin.role !== 'SUPERADMIN' && admin.id !== currentUserId && (
                  <button
                    onClick={() => handleRemove(admin.id, admin.name)}
                    className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1.5 rounded-md transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Rétrograder
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add admin form */}
      <div className="bg-white rounded-xl border border-ivory-200 shadow-sm">
        <div className="px-6 py-4 border-b border-ivory-100">
          <h2 className="font-semibold text-charcoal flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Ajouter un admin
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Si l&apos;email existe déjà (client), il sera promu admin. Sinon, un nouveau compte admin est créé.
          </p>
        </div>
        <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}
          {success && <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-md">{success}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-charcoal mb-1">Nom</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-ivory-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                placeholder="Prénom Nom"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-charcoal mb-1">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border border-ivory-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-charcoal mb-1">Mot de passe</label>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full border border-ivory-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                placeholder="Min. 8 caractères"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-charcoal mb-1">Langue</label>
              <select
                value={form.language}
                onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
                className="w-full border border-ivory-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="bg-gold-600 hover:bg-gold-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors disabled:opacity-50"
            >
              {submitting ? 'En cours…' : "Créer l'admin"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
