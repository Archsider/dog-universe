'use client';

import { useState } from 'react';
import { formatMAD } from '@/lib/utils';
import { Pencil, Trash2, Plus, Check, X } from 'lucide-react';

const MONTH_NAMES_FR = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const MONTH_NAMES_EN = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type Summary = {
  id: string;
  year: number;
  month: number;
  boardingRevenue: number;
  groomingRevenue: number;
  taxiRevenue: number;
  otherRevenue: number;
  notes: string | null;
  author: { name: string };
};

type FormData = {
  year: string;
  month: string;
  boardingRevenue: string;
  groomingRevenue: string;
  taxiRevenue: string;
  otherRevenue: string;
  notes: string;
};

const EMPTY_FORM: FormData = {
  year: String(new Date().getFullYear()),
  month: String(new Date().getMonth() + 1),
  boardingRevenue: '0',
  groomingRevenue: '0',
  taxiRevenue: '0',
  otherRevenue: '0',
  notes: '',
};

export default function RevenueSummaryManager({
  initialSummaries,
  isSuperAdmin,
  locale,
}: {
  initialSummaries: Summary[];
  isSuperAdmin: boolean;
  locale: string;
}) {
  const [summaries, setSummaries] = useState<Summary[]>(initialSummaries);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const months = locale === 'fr' ? MONTH_NAMES_FR : MONTH_NAMES_EN;

  const l = locale === 'fr' ? {
    title: 'Données historiques de revenus',
    subtitle: 'Saisie manuelle des chiffres d\'affaires mensuels (avant démarrage de l\'app)',
    addMonth: 'Ajouter un mois',
    year: 'Année',
    month: 'Mois',
    boarding: 'Pension',
    grooming: 'Toilettage',
    taxi: 'Taxi',
    other: 'Croquettes',
    total: 'Total',
    notes: 'Notes',
    save: 'Enregistrer',
    cancel: 'Annuler',
    edit: 'Modifier',
    delete: 'Supprimer',
    confirmDelete: 'Confirmer la suppression ?',
    yes: 'Oui, supprimer',
    no: 'Annuler',
    by: 'par',
    empty: 'Aucune donnée historique. Ajoutez les mois de janvier, février, mars...',
    superadminOnly: 'Suppression réservée au SUPERADMIN',
  } : {
    title: 'Historical Revenue Data',
    subtitle: 'Manual entry of monthly revenue figures (before app launch)',
    addMonth: 'Add month',
    year: 'Year',
    month: 'Month',
    boarding: 'Boarding',
    grooming: 'Grooming',
    taxi: 'Taxi',
    other: 'Croquettes',
    total: 'Total',
    notes: 'Notes',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    confirmDelete: 'Confirm deletion?',
    yes: 'Yes, delete',
    no: 'Cancel',
    by: 'by',
    empty: 'No historical data. Add months like January, February, March...',
    superadminOnly: 'Deletion restricted to SUPERADMIN',
  };

  const totalRevenue = summaries.reduce(
    (sum, s) => sum + s.boardingRevenue + s.groomingRevenue + s.taxiRevenue + s.otherRevenue,
    0
  );

  function openEdit(s: Summary) {
    setEditId(s.id);
    setForm({
      year: String(s.year),
      month: String(s.month),
      boardingRevenue: String(s.boardingRevenue),
      groomingRevenue: String(s.groomingRevenue),
      taxiRevenue: String(s.taxiRevenue),
      otherRevenue: String(s.otherRevenue),
      notes: s.notes ?? '',
    });
    setShowForm(true);
    setError(null);
  }

  function openNew() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setError(null);
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const url = editId
        ? `/api/admin/revenue-summary/${editId}`
        : '/api/admin/revenue-summary';
      const method = editId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: parseInt(form.year),
          month: parseInt(form.month),
          boardingRevenue: parseFloat(form.boardingRevenue) || 0,
          groomingRevenue: parseFloat(form.groomingRevenue) || 0,
          taxiRevenue: parseFloat(form.taxiRevenue) || 0,
          otherRevenue: parseFloat(form.otherRevenue) || 0,
          notes: form.notes || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Erreur');
        return;
      }

      const saved = await res.json();
      // Refresh list
      const listRes = await fetch('/api/admin/revenue-summary');
      if (listRes.ok) {
        setSummaries(await listRes.json());
      } else if (editId) {
        setSummaries(prev => prev.map(s => (s.id === editId ? { ...s, ...saved } : s)));
      } else {
        setSummaries(prev => [saved, ...prev]);
      }
      setShowForm(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/revenue-summary/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? (locale === 'fr' ? 'Erreur' : 'Error'));
        return;
      }
      setSummaries(prev => prev.filter(s => s.id !== id));
      setDeleteConfirm(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header + total */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
          <p className="text-sm text-gray-500 mt-1">{l.subtitle}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-gray-400">{l.total}</div>
            <div className="font-bold text-gold-600 text-lg">{formatMAD(totalRevenue)}</div>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-charcoal text-white text-sm font-medium rounded-lg hover:bg-charcoal/80 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {l.addMonth}
          </button>
        </div>
      </div>

      {/* Add / edit form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gold-200 shadow-card p-5">
          <h2 className="font-semibold text-charcoal mb-4">
            {editId ? l.edit : l.addMonth}
          </h2>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{l.year}</label>
              <input
                type="number"
                value={form.year}
                onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                disabled={!!editId}
                className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-300 disabled:bg-gray-50"
                min={2020}
                max={2100}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{l.month}</label>
              <select
                value={form.month}
                onChange={e => setForm(f => ({ ...f, month: e.target.value }))}
                disabled={!!editId}
                className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-300 disabled:bg-gray-50"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{months[m]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            {[
              { key: 'boardingRevenue', label: l.boarding },
              { key: 'groomingRevenue', label: l.grooming },
              { key: 'taxiRevenue', label: l.taxi },
              { key: 'otherRevenue', label: l.other },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label} (MAD)</label>
                <input
                  type="number"
                  value={form[key as keyof FormData]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-300"
                  min={0}
                  step={0.01}
                />
              </div>
            ))}
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">{l.notes}</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-300"
              maxLength={1000}
              placeholder={locale === 'fr' ? 'Optionnel — ex: données estimées' : 'Optional — e.g. estimated data'}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-charcoal text-white text-sm font-medium rounded-lg hover:bg-charcoal/80 disabled:opacity-50 transition-colors"
            >
              <Check className="h-4 w-4" />
              {l.save}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-ivory-200 text-gray-600 text-sm font-medium rounded-lg hover:border-gold-300 transition-colors"
            >
              <X className="h-4 w-4" />
              {l.cancel}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card overflow-hidden">
        {summaries.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">{l.empty}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ivory-200 bg-ivory-50">
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{l.month}</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 hidden sm:table-cell">{l.boarding}</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">{l.grooming}</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">{l.taxi}</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">{l.other}</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">{l.total}</th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody>
                {summaries.map(s => {
                  const total = s.boardingRevenue + s.groomingRevenue + s.taxiRevenue + s.otherRevenue;
                  return (
                    <tr key={s.id} className="border-b border-ivory-100 last:border-0 hover:bg-ivory-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm text-charcoal">
                          {months[s.month]} {s.year}
                        </div>
                        {s.notes && <div className="text-xs text-gray-400 mt-0.5">{s.notes}</div>}
                        <div className="text-xs text-gray-400">{l.by} {s.author.name}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 hidden sm:table-cell">{formatMAD(s.boardingRevenue)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 hidden md:table-cell">{formatMAD(s.groomingRevenue)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 hidden md:table-cell">{formatMAD(s.taxiRevenue)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 hidden lg:table-cell">{formatMAD(s.otherRevenue)}</td>
                      <td className="px-4 py-3 text-right font-bold text-charcoal">{formatMAD(total)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(s)}
                            className="p-1.5 text-gray-400 hover:text-gold-600 rounded transition-colors"
                            title={l.edit}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {isSuperAdmin && (
                            deleteConfirm === s.id ? (
                              <span className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDelete(s.id)}
                                  disabled={loading}
                                  className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                                >
                                  {l.yes}
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                                >
                                  {l.no}
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirm(s.id)}
                                className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                                title={l.delete}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
