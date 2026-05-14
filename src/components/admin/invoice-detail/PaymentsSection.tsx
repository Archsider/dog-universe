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
  newPaymentSendSms: boolean;
  addingPayment: boolean;
  deletingPaymentId: string | null;
  onChangeDate: (v: string) => void;
  onChangeAmount: (v: string) => void;
  onChangeMethod: (v: string) => void;
  onChangeSendSms: (v: boolean) => void;
  onAddPayment: () => void;
  onDeletePayment: (paymentId: string) => void;
}

// Casablanca quiet-hours check mirrors src/lib/sms-policy.ts (UTC+1
// fixed, 21h–9h). Duplicated as a 1-line inline function so the toggle
// label updates without a server round-trip. Keep in sync with the
// policy constants if they're ever tuned. See ADR-0008.
const CASA_OFFSET_MIN = 60;
function isQuietHoursCasaClient(now: Date = new Date()): boolean {
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const casaHour = Math.floor((utcMin + CASA_OFFSET_MIN) / 60) % 24;
  return casaHour < 9 || casaHour >= 21;
}

export function AddPaymentSection({
  invoice, locale, isFr,
  newPaymentDate, newPaymentAmount, newPaymentMethod, newPaymentSendSms,
  addingPayment, deletingPaymentId,
  onChangeDate, onChangeAmount, onChangeMethod, onChangeSendSms, onAddPayment, onDeletePayment,
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

      {/* Respectful-SMS toggle (ADR-0008). Identical UX to PaymentModal —
          single canonical control across the 3 payment-recording surfaces
          (billing list / booking detail / this invoice detail). The
          server-side policy still kicks in: a checked walkin still skips
          the SMS, a checked night-time send still defers to 9h Casa. */}
      <div className="mb-3 rounded-lg border border-ivory-200 bg-ivory-50/50 px-3 py-2.5">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={newPaymentSendSms}
            onChange={(e) => onChangeSendSms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gold-600 focus:ring-gold-300"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-charcoal">
              {isFr ? 'Envoyer SMS de confirmation au client' : 'Send confirmation SMS to client'}
            </p>
            {invoice.client.isWalkIn && (
              <p className="text-xs text-gray-500 mt-0.5">
                ⓘ {isFr ? 'Walk-in — SMS non recommandé' : 'Walk-in — SMS not recommended'}
              </p>
            )}
            {!invoice.client.isWalkIn && newPaymentSendSms && isQuietHoursCasaClient() && (
              <p className="text-xs text-amber-700 mt-0.5">
                ⏰ {isFr
                  ? 'Heures calmes — SMS reporté à 9h demain'
                  : 'Quiet hours — SMS deferred to 9 AM tomorrow'}
              </p>
            )}
          </div>
        </label>
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
