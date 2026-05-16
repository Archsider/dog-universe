'use client';

// Modal "Nouvelle facture walk-in" — 3 étapes (Client / Items / Paiement).
//
// Orchestrateur seul. Toute la mécanique du wizard est dans
// `./walkin-invoice/` :
//   - `useWalkinForm`    : state + validation + reset on close
//   - `WalkinClientStep` : step 1 (existant / anonyme)
//   - `WalkinItemsStep`  : step 2 (multi-lignes + DISCOUNT)
//   - `WalkinPaymentStep`: step 3 (date / méthode / notes) + `WalkinConfirmStep`
//
// Vit sur /admin/billing à côté de "Créer une facture" pour rester
// dans le flow de saisie quotidien de Mehdi. Posté contre
// POST /api/admin/walkin-invoice avec un Idempotency-Key généré côté
// client (crypto.randomUUID quand dispo, fallback ts-aleatoire).
//
// Submit flow :
//   - Step 1 → 2 → 3 (validation locale entre chaque)
//   - Step 3 → confirm screen (read-only recap, anti one-click)
//   - Confirm → POST → close + router.refresh + toast event

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, ArrowLeft, ArrowRight, Check, Loader2, Receipt } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import WalkinClientStep from './walkin-invoice/WalkinClientStep';
import WalkinItemsStep from './walkin-invoice/WalkinItemsStep';
import WalkinPaymentStep, { WalkinConfirmStep } from './walkin-invoice/WalkinPaymentStep';
import { useWalkinForm } from './walkin-invoice/useWalkinForm';

interface Props {
  locale: string;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `walkin_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

export default function WalkinInvoiceModal({ locale }: Props) {
  const fr = locale === 'fr';
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useWalkinForm(open);

  async function submit() {
    form.setError(null);
    form.setSubmitting(true);
    try {
      const idempotencyKey = newIdempotencyKey();
      const body = {
        clientId: form.clientMode === 'existing' ? form.clientId : null,
        clientName: form.clientMode === 'anonymous' && form.anonName.trim() ? form.anonName.trim() : null,
        paymentDate: new Date(`${form.paymentDate}T12:00:00+01:00`).toISOString(),
        paymentMethod: form.paymentMethod,
        items: form.items.map((it) => ({
          category: it.category,
          description: it.description.trim(),
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
        notes: form.notes.trim() || null,
      };
      const res = await fetch('/api/admin/walkin-invoice', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        form.setError(data.error || 'UNKNOWN_ERROR');
        form.setSubmitting(false);
        return;
      }
      // Success — close + refresh the billing list so the new invoice appears.
      setOpen(false);
      router.refresh();
      // Best-effort toast — graceful fallback if no global toast lib.
      // Most pages already use a top-level toaster ; this keeps the
      // modal self-contained.
      if (typeof window !== 'undefined') {
        const msg = fr
          ? `Facture ${data.invoiceNumber} créée et encaissée ✓`
          : `Invoice ${data.invoiceNumber} created and paid ✓`;
        // Soft non-blocking notification — falls back to console if no UI hook.
        try { window.dispatchEvent(new CustomEvent('toast', { detail: { kind: 'success', message: msg } })); } catch {}
      }
    } catch (err) {
      form.setError(err instanceof Error ? err.message : 'NETWORK_ERROR');
      form.setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C4974A] hover:bg-[#9A7235] text-white text-sm font-medium transition-colors"
      >
        <Receipt className="h-4 w-4" />
        {fr ? '+ Facture walk-in' : '+ Walk-in invoice'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-0 md:p-4">
          <div className="bg-white w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[95vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0D98A]/30">
              <div>
                <h2 className="text-lg font-bold text-charcoal">
                  {fr ? 'Nouvelle facture walk-in' : 'New walk-in invoice'}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {fr ? `Étape ${form.step} sur 3` : `Step ${form.step} of 3`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-md hover:bg-[#F5EAD0]/50"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-[#F0D98A]/30">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`flex-1 h-1.5 rounded-full ${
                    s <= form.step ? 'bg-[#C4974A]' : 'bg-[#F5EAD0]'
                  }`}
                />
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {form.step === 1 && (
                <WalkinClientStep
                  fr={fr}
                  locale={locale}
                  mode={form.clientMode}
                  onModeChange={form.setClientMode}
                  clientId={form.clientId}
                  onClientIdChange={form.setClientId}
                  anonName={form.anonName}
                  onAnonNameChange={form.setAnonName}
                />
              )}
              {form.step === 2 && (
                <WalkinItemsStep
                  fr={fr}
                  items={form.items}
                  total={form.total}
                  onAdd={form.addItem}
                  onRemove={form.removeItem}
                  onUpdate={form.updateItem}
                />
              )}
              {form.step === 3 && !form.confirming && (
                <WalkinPaymentStep
                  fr={fr}
                  paymentDate={form.paymentDate}
                  onPaymentDateChange={form.setPaymentDate}
                  paymentMethod={form.paymentMethod}
                  onPaymentMethodChange={form.setPaymentMethod}
                  notes={form.notes}
                  onNotesChange={form.setNotes}
                  total={form.total}
                />
              )}
              {form.step === 3 && form.confirming && (
                <WalkinConfirmStep
                  fr={fr}
                  total={form.total}
                  paymentMethod={form.paymentMethod}
                  paymentDate={form.paymentDate}
                  clientLabel={
                    form.clientMode === 'existing'
                      ? (fr ? 'Client existant sélectionné' : 'Existing client selected')
                      : form.anonName.trim() || (fr ? 'Anonyme' : 'Anonymous')
                  }
                  itemCount={form.items.length}
                />
              )}

              {form.error && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {fr ? 'Erreur :' : 'Error:'} <strong>{form.error}</strong>
                </div>
              )}
            </div>

            {/* Footer nav. On the confirm screen, "Back" exits the confirm
                view (returns to the editable form) and the primary CTA
                becomes "Confirm & cash in" which fires the POST. */}
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[#F0D98A]/30 bg-[#FBF5E0]/30">
              {(form.step > 1 || form.confirming) ? (
                <button
                  type="button"
                  onClick={() => {
                    if (form.confirming) form.setConfirming(false);
                    else form.setStep((s) => (s - 1) as 1 | 2 | 3);
                  }}
                  disabled={form.submitting}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-charcoal hover:bg-[#F5EAD0]/50"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {fr ? 'Retour' : 'Back'}
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500 tabular-nums">
                  {fr ? 'Total' : 'Total'} <strong className="text-charcoal">{formatMAD(form.total)}</strong>
                </span>
                {form.step < 3 ? (
                  <button
                    type="button"
                    onClick={() => form.setStep((s) => (s + 1) as 1 | 2 | 3)}
                    disabled={(form.step === 1 && !form.step1Valid) || (form.step === 2 && !form.step2Valid)}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-[#C4974A] text-white text-sm font-medium hover:bg-[#9A7235] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {fr ? 'Suivant' : 'Next'}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : !form.confirming ? (
                  // First click on step 3 : open the read-only recap. We
                  // intentionally do NOT call submit() here — money mutations
                  // need an explicit second click on the recap screen.
                  <button
                    type="button"
                    onClick={() => form.setConfirming(true)}
                    disabled={!form.step1Valid || !form.step2Valid || !form.step3Valid || form.submitting}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-[#C4974A] text-white text-sm font-medium hover:bg-[#9A7235] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {fr ? 'Encaisser' : 'Cash in'}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={submit}
                    disabled={form.submitting}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {form.submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {fr ? 'Confirmer et encaisser' : 'Confirm & cash in'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
