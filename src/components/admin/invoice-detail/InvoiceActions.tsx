'use client';

import { Loader2, Trash2 } from 'lucide-react';

interface DeleteModalProps {
  invoiceNumber: string;
  isFr: boolean;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteInvoiceModal({
  invoiceNumber, isFr, deleting, onCancel, onConfirm,
}: DeleteModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => { if (!deleting) onCancel(); }}
      />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <Trash2 className="h-5 w-5 text-red-600" />
          </div>
          <h2 className="text-lg font-serif font-bold text-charcoal">
            {isFr ? 'Supprimer la facture ?' : 'Delete invoice?'}
          </h2>
        </div>

        <p className="text-sm font-mono font-semibold text-charcoal mb-2">
          {invoiceNumber}
        </p>
        <p className="text-sm text-gray-500 mb-6">
          {isFr
            ? 'Cette action est irréversible. Tous les paiements associés seront supprimés.'
            : 'This action cannot be undone. All associated payments will be deleted.'}
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {isFr ? 'Annuler' : 'Cancel'}
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {deleting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Trash2 className="h-4 w-4" />}
            {isFr ? 'Supprimer' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
