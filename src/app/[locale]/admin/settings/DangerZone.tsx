'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  locale: string;
}

const operations = [
  {
    key: 'delete_cancelled',
    labelFr: 'Supprimer les réservations annulées',
    labelEn: 'Delete cancelled reservations',
    descFr: 'Supprime toutes les réservations avec le statut ANNULÉE ainsi que leurs factures.',
    descEn: 'Permanently deletes all CANCELLED reservations and their invoices.',
    color: 'orange',
  },
  {
    key: 'delete_completed',
    labelFr: 'Supprimer les réservations terminées',
    labelEn: 'Delete completed reservations',
    descFr: 'Supprime toutes les réservations avec le statut TERMINÉE ainsi que leurs factures.',
    descEn: 'Permanently deletes all COMPLETED reservations and their invoices.',
    color: 'orange',
  },
  {
    key: 'delete_pending_old',
    labelFr: 'Supprimer les demandes en attente > 30j',
    labelEn: 'Delete old pending requests (> 30 days)',
    descFr: 'Supprime les réservations en attente créées il y a plus de 30 jours.',
    descEn: 'Deletes pending reservations created more than 30 days ago.',
    color: 'red',
  },
] as const;

type OpKey = (typeof operations)[number]['key'];

export default function DangerZone({ locale }: Props) {
  const [confirm, setConfirm] = useState<OpKey | null>(null);
  const [running, setRunning] = useState<OpKey | null>(null);

  const isFr = locale !== 'en';
  const title = isFr ? 'Zone danger' : 'Danger zone';
  const subtitle = isFr ? 'Actions irréversibles — procéder avec précaution.' : 'Irreversible actions — proceed with caution.';
  const cancelLbl = isFr ? 'Annuler' : 'Cancel';
  const confirmLbl = isFr ? 'Confirmer la suppression' : 'Confirm deletion';
  const confirmTitle = isFr ? 'Confirmer l\'opération ?' : 'Confirm operation?';
  const confirmWarning = isFr ? 'Cette action est irréversible.' : 'This action cannot be undone.';

  const run = async (op: OpKey) => {
    setRunning(op);
    setConfirm(null);
    try {
      const res = await fetch('/api/admin/danger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: op }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error('Failed');
      const count = data.deleted ?? 0;
      const msg = isFr ? `${count} réservation(s) supprimée(s).` : `${count} reservation(s) deleted.`;
      toast({ title: msg, variant: 'success' });
    } catch {
      toast({ title: isFr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setRunning(null);
    }
  };

  const pendingOp = operations.find(o => o.key === confirm);

  return (
    <div className="bg-white rounded-xl border border-red-200 shadow-card overflow-hidden">
      <div className="px-5 py-4 bg-red-50 border-b border-red-200 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
        <div>
          <h2 className="font-semibold text-red-800 text-sm">{title}</h2>
          <p className="text-xs text-red-600">{subtitle}</p>
        </div>
      </div>

      <div className="divide-y divide-red-100">
        {operations.map(op => {
          const label = isFr ? op.labelFr : op.labelEn;
          const desc = isFr ? op.descFr : op.descEn;
          const isRunning = running === op.key;
          return (
            <div key={op.key} className="px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-charcoal">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
              <button
                onClick={() => setConfirm(op.key)}
                disabled={isRunning || running !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-40 flex-shrink-0"
              >
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {isFr ? 'Exécuter' : 'Run'}
              </button>
            </div>
          );
        })}
      </div>

      {confirm && pendingOp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <h2 className="text-lg font-serif font-bold text-charcoal mb-2">{confirmTitle}</h2>
            <p className="text-sm font-medium text-charcoal mb-1">{isFr ? pendingOp.labelFr : pendingOp.labelEn}</p>
            <p className="text-sm text-gray-500 mb-6">{confirmWarning}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 px-4 py-2 border border-ivory-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-ivory-50"
              >
                {cancelLbl}
              </button>
              <button
                onClick={() => run(confirm)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
              >
                {confirmLbl}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
