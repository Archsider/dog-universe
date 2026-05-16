'use client';

// Step 3 — Payment date + method + free-text notes + green "to collect" bandeau.
// Also exposes the read-only confirm recap shown before the actual POST.

import { formatMAD } from '@/lib/utils';
import { METHOD_LABELS, type PaymentMethod } from './types';
import { todayCasaYmd } from './useWalkinForm';

// ────────────────────────────────────────────────────────────────────
// Step 3 — Paiement (date + méthode + notes)
// ────────────────────────────────────────────────────────────────────

interface PaymentProps {
  fr: boolean;
  paymentDate: string;
  onPaymentDateChange: (d: string) => void;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (m: PaymentMethod) => void;
  notes: string;
  onNotesChange: (n: string) => void;
  total: number;
}

export default function WalkinPaymentStep({
  fr, paymentDate, onPaymentDateChange, paymentMethod, onPaymentMethodChange, notes, onNotesChange, total,
}: PaymentProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-charcoal mb-1.5">
          {fr ? 'Date du paiement' : 'Payment date'}
        </label>
        <input
          type="date"
          value={paymentDate}
          onChange={(e) => onPaymentDateChange(e.target.value)}
          max={todayCasaYmd()}
          className="w-full md:w-auto px-3 py-2 rounded-lg border border-[#E2C048]/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-charcoal mb-1.5">
          {fr ? 'Mode de paiement' : 'Payment method'}
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => {
            const active = paymentMethod === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => onPaymentMethodChange(m)}
                className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#C4974A] border-[#C4974A] text-white'
                    : 'bg-white border-[#E2C048]/40 text-charcoal hover:bg-[#FBF5E0]/40'
                }`}
              >
                <span className="mr-1" aria-hidden="true">{METHOD_LABELS[m].emoji}</span>
                {fr ? METHOD_LABELS[m].fr : METHOD_LABELS[m].en}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-charcoal mb-1.5">
          {fr ? 'Notes (optionnel)' : 'Notes (optional)'}
        </label>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={3}
          maxLength={2000}
          className="w-full px-3 py-2 rounded-lg border border-[#E2C048]/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
          placeholder={fr ? 'Ex : remise client fidèle, paiement reporté…' : 'E.g. loyal customer discount, deferred payment…'}
        />
      </div>

      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
        <p className="text-xs text-emerald-700 mb-1">
          {fr ? 'À encaisser' : 'To collect'}
        </p>
        <p className="text-2xl font-bold text-emerald-700 tabular-nums">{formatMAD(total)}</p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// WalkinConfirmStep — read-only recap shown after step 3, before POST.
// Source audit Wroblewski O1 : money mutations must never be one-click
// reachable from a typo Tab-Enter. The CTA on this screen carries the
// final intent.
// ────────────────────────────────────────────────────────────────────

interface ConfirmProps {
  fr: boolean;
  total: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  clientLabel: string;
  itemCount: number;
}

export function WalkinConfirmStep({
  fr, total, paymentMethod, paymentDate, clientLabel, itemCount,
}: ConfirmProps) {
  return (
    <div className="space-y-4" data-testid="walkin-confirm-step">
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-sm font-semibold text-amber-900">
          {fr ? "Vous êtes sur le point d'encaisser :" : 'You are about to cash in:'}
        </p>
      </div>

      <ul className="space-y-2.5 text-sm">
        <li className="flex items-baseline justify-between border-b border-[#F0D98A]/30 pb-2">
          <span className="text-gray-500">{fr ? 'Montant total' : 'Total amount'}</span>
          <span className="text-lg font-bold text-emerald-700 tabular-nums" data-testid="walkin-confirm-total">
            {formatMAD(total)}
          </span>
        </li>
        <li className="flex items-baseline justify-between border-b border-[#F0D98A]/30 pb-2">
          <span className="text-gray-500">{fr ? 'Mode paiement' : 'Payment method'}</span>
          <span className="font-medium text-charcoal" data-testid="walkin-confirm-method">
            {fr ? METHOD_LABELS[paymentMethod].fr : METHOD_LABELS[paymentMethod].en}
          </span>
        </li>
        <li className="flex items-baseline justify-between border-b border-[#F0D98A]/30 pb-2">
          <span className="text-gray-500">{fr ? 'Client' : 'Client'}</span>
          <span className="font-medium text-charcoal truncate ml-3" data-testid="walkin-confirm-client">{clientLabel}</span>
        </li>
        <li className="flex items-baseline justify-between border-b border-[#F0D98A]/30 pb-2">
          <span className="text-gray-500">{fr ? 'Date' : 'Date'}</span>
          <span className="font-medium text-charcoal tabular-nums">{paymentDate}</span>
        </li>
        <li className="flex items-baseline justify-between">
          <span className="text-gray-500">{fr ? 'Lignes facturées' : 'Invoiced lines'}</span>
          <span className="font-medium text-charcoal tabular-nums">{itemCount}</span>
        </li>
      </ul>

      <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-xs text-red-700 leading-relaxed">
          {fr
            ? "Cette action crée une facture payée immédiatement et ne peut pas être annulée automatiquement."
            : 'This action creates an immediately-paid invoice and cannot be automatically undone.'}
        </p>
      </div>
    </div>
  );
}
