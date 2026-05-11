'use client';

import { Banknote, Loader2, Plus, Trash2 } from 'lucide-react';
import { METHOD_ICONS, METHOD_LABELS, fmtPaymentDate, type InvoiceData } from './lib';

// ── Payment history (view mode) ──────────────────────────────────────────────

interface HistoryProps {
  invoice: InvoiceData;
  locale: string;
  isFr: boolean;
  deletingPaymentId: string | null;
  onDeletePayment: (paymentId: string) => void;
}

export function PaymentHistorySection({
  invoice, locale, isFr, deletingPaymentId, onDeletePayment,
}: HistoryProps) {
  if (invoice.payments.length === 0) return null;
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        {isFr ? 'Historique des paiements' : 'Payment history'}
      </p>
      <div className="space-y-2">
        {invoice.payments.map(p => {
          const Icon = METHOD_ICONS[p.paymentMethod] ?? Banknote;
          return (
            <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-ivory-50 last:border-0">
              <div className="flex items-center gap-2 text-sm">
                <Icon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-gray-600">
                  {METHOD_LABELS[p.paymentMethod]?.[isFr ? 'fr' : 'en'] ?? p.paymentMethod}
                </span>
                <span className="text-gray-400 text-xs">{fmtPaymentDate(p.paymentDate, locale)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-green-700 text-sm">{Number(p.amount).toFixed(2)} MAD</span>
                <button
                  onClick={() => onDeletePayment(p.id)}
                  disabled={deletingPaymentId === p.id}
                  className="text-gray-300 hover:text-red-400 disabled:opacity-50 transition-colors"
                  title={isFr ? 'Supprimer ce paiement' : 'Delete this payment'}
                >
                  {deletingPaymentId === p.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Add payment + existing payments (edit mode) ──────────────────────────────

interface AddProps {
  invoice: InvoiceData;
  locale: string;
  isFr: boolean;
  newPaymentDate: string;
  newPaymentAmount: string;
  newPaymentMethod: string;
  addingPayment: boolean;
  deletingPaymentId: string | null;
  onChangeDate: (v: string) => void;
  onChangeAmount: (v: string) => void;
  onChangeMethod: (v: string) => void;
  onAddPayment: () => void;
  onDeletePayment: (paymentId: string) => void;
}

export function AddPaymentSection({
  invoice, locale, isFr,
  newPaymentDate, newPaymentAmount, newPaymentMethod,
  addingPayment, deletingPaymentId,
  onChangeDate, onChangeAmount, onChangeMethod, onAddPayment, onDeletePayment,
}: AddProps) {
  if (invoice.status === 'CANCELLED') return null;
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
        {isFr ? 'Ajouter un paiement' : 'Add a payment'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
            {isFr ? 'Montant (MAD)' : 'Amount (MAD)'}
          </label>
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={newPaymentAmount}
            onChange={e => onChangeAmount(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
            {isFr ? 'Mode' : 'Method'}
          </label>
          <select
            value={newPaymentMethod}
            onChange={e => onChangeMethod(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400 bg-white"
          >
            <option value="CASH">{isFr ? 'Espèces' : 'Cash'}</option>
            <option value="CARD">{isFr ? 'Carte / TPE' : 'Card / POS'}</option>
            <option value="CHECK">{isFr ? 'Chèque' : 'Check'}</option>
            <option value="TRANSFER">{isFr ? 'Virement' : 'Transfer'}</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
            {isFr ? 'Date' : 'Date'}
          </label>
          <input
            type="date"
            value={newPaymentDate}
            onChange={e => onChangeDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400"
          />
        </div>
      </div>
      <button
        onClick={onAddPayment}
        disabled={addingPayment}
        className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 transition-colors"
      >
        {addingPayment
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Plus className="h-4 w-4" />}
        {isFr ? 'Enregistrer le paiement' : 'Record payment'}
      </button>

      {invoice.payments.length > 0 && (
        <div className="mt-4 pt-3 border-t border-ivory-100 space-y-1.5">
          <p className="text-xs text-gray-400 mb-2">
            {isFr ? 'Paiements existants' : 'Existing payments'}
          </p>
          {invoice.payments.map(p => {
            const Icon = METHOD_ICONS[p.paymentMethod] ?? Banknote;
            return (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                  <span className="text-gray-500">
                    {METHOD_LABELS[p.paymentMethod]?.[isFr ? 'fr' : 'en'] ?? p.paymentMethod}
                  </span>
                  <span className="text-gray-400 text-xs">{fmtPaymentDate(p.paymentDate, locale)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-green-700">{Number(p.amount).toFixed(2)} MAD</span>
                  <button
                    onClick={() => onDeletePayment(p.id)}
                    disabled={deletingPaymentId === p.id}
                    className="text-gray-300 hover:text-red-400 disabled:opacity-50 transition-colors"
                    title={isFr ? 'Supprimer' : 'Delete'}
                  >
                    {deletingPaymentId === p.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
