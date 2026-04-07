'use client';

import { useState } from 'react';
import { AlertTriangle, ShieldAlert, Eye, Trash2 } from 'lucide-react';

type PreviewData = {
  clients: number;
  pets: number;
  bookings: number;
  invoices: number;
  notifications: number;
  contracts: number;
  loyaltyClaims: number;
  actionLogs: number;
  adminNotes: number;
  passwordResetTokens: number;
  preserved: string;
};

export default function ProductionResetPanel({ locale }: { locale: string }) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [step, setStep] = useState<'idle' | 'preview' | 'confirm' | 'done'>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [result, setResult] = useState<PreviewData | null>(null);

  const CONFIRM_PHRASE = 'RESET PRODUCTION';

  const l = locale === 'fr' ? {
    title: 'Réinitialisation production',
    subtitle: 'Supprime toutes les données de test. Irréversible.',
    warning: 'Cette action supprimera définitivement tous les clients, animaux, réservations, factures et données de test. Les comptes ADMIN et SUPERADMIN sont préservés.',
    preview: 'Aperçu — que sera supprimé',
    previewBtn: 'Voir ce qui sera supprimé',
    confirmTitle: 'Confirmer la suppression irréversible',
    confirmDesc: 'Tapez exactement pour confirmer :',
    executeBtn: 'Exécuter la réinitialisation',
    cancel: 'Annuler',
    doneTitle: 'Réinitialisation terminée',
    doneDesc: 'La base de données est propre. Vous pouvez commencer la production.',
    storageWarning: 'Les fichiers PDF de contrats dans Supabase Storage (uploads-private/contracts/) doivent être supprimés manuellement.',
    clients: 'Clients (rôle CLIENT)',
    pets: 'Animaux',
    bookings: 'Réservations',
    invoices: 'Factures',
    notifications: 'Notifications',
    contracts: 'Contrats signés',
    loyaltyClaims: 'Réclamations fidélité',
    actionLogs: 'Journaux d\'actions',
    adminNotes: 'Notes admin',
    passwordResets: 'Tokens de réinitialisation',
    preserved: 'Préservé',
  } : {
    title: 'Production Reset',
    subtitle: 'Deletes all test data. Irreversible.',
    warning: 'This action will permanently delete all clients, pets, bookings, invoices, and test data. ADMIN and SUPERADMIN accounts are preserved.',
    preview: 'Preview — what will be deleted',
    previewBtn: 'Preview what will be deleted',
    confirmTitle: 'Confirm irreversible deletion',
    confirmDesc: 'Type exactly to confirm:',
    executeBtn: 'Execute reset',
    cancel: 'Cancel',
    doneTitle: 'Reset complete',
    doneDesc: 'The database is clean. You can start production.',
    storageWarning: 'Contract PDF files in Supabase Storage (uploads-private/contracts/) must be deleted manually.',
    clients: 'Clients (CLIENT role)',
    pets: 'Pets',
    bookings: 'Bookings',
    invoices: 'Invoices',
    notifications: 'Notifications',
    contracts: 'Signed contracts',
    loyaltyClaims: 'Loyalty claims',
    actionLogs: 'Action logs',
    adminNotes: 'Admin notes',
    passwordResets: 'Password reset tokens',
    preserved: 'Preserved',
  };

  async function handlePreview() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/production-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error'); return; }
      setPreview(data.wouldDelete);
      setStep('preview');
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    if (confirmText !== CONFIRM_PHRASE) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/production-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error'); return; }
      setResult(data.deleted);
      setStep('done');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'done' && result) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-2 text-green-700 font-semibold">
          <ShieldAlert className="h-5 w-5" />
          {l.doneTitle}
        </div>
        <p className="text-sm text-green-700">{l.doneDesc}</p>
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          {l.storageWarning}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 space-y-4">
      <div className="flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-red-800">{l.title}</div>
          <div className="text-sm text-red-700 mt-0.5">{l.subtitle}</div>
        </div>
      </div>

      <div className="text-sm text-red-700 bg-red-100 rounded-lg p-3 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        {l.warning}
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-100 rounded-lg p-3">{error}</div>
      )}

      {step === 'idle' && (
        <button
          onClick={handlePreview}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-red-300 text-red-700 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          <Eye className="h-4 w-4" />
          {loading ? '...' : l.previewBtn}
        </button>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-3">
          <div className="font-medium text-sm text-red-800">{l.preview}</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              [l.clients, preview.clients],
              [l.pets, preview.pets],
              [l.bookings, preview.bookings],
              [l.invoices, preview.invoices],
              [l.notifications, preview.notifications],
              [l.contracts, preview.contracts],
              [l.loyaltyClaims, preview.loyaltyClaims],
              [l.actionLogs, preview.actionLogs],
              [l.adminNotes, preview.adminNotes],
              [l.passwordResets, preview.passwordResetTokens],
            ].map(([label, count]) => (
              <div key={String(label)} className="flex justify-between bg-white rounded-lg px-3 py-1.5 border border-red-100">
                <span className="text-gray-600">{label}</span>
                <span className={`font-semibold ${Number(count) > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {count}
                </span>
              </div>
            ))}
          </div>
          <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-2">
            ✓ {l.preserved}: {preview.preserved}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStep('confirm')}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              {l.executeBtn}
            </button>
            <button
              onClick={() => setStep('idle')}
              className="px-4 py-2 bg-white border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:border-gray-300 transition-colors"
            >
              {l.cancel}
            </button>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div className="space-y-3">
          <div className="font-medium text-sm text-red-800">{l.confirmTitle}</div>
          <div className="text-sm text-red-700">{l.confirmDesc}</div>
          <code className="block px-3 py-2 bg-red-100 rounded-lg font-mono text-sm text-red-800 font-bold">
            {CONFIRM_PHRASE}
          </code>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400"
            placeholder={CONFIRM_PHRASE}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleExecute}
              disabled={loading || confirmText !== CONFIRM_PHRASE}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              {loading ? '...' : l.executeBtn}
            </button>
            <button
              onClick={() => { setStep('idle'); setConfirmText(''); }}
              className="px-4 py-2 bg-white border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:border-gray-300 transition-colors"
            >
              {l.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
