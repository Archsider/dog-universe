'use client';

// Modal "Nouvelle facture walk-in" — 3 étapes (Client / Items / Paiement).
//
// Vit sur /admin/billing à côté de "Créer une facture" pour rester
// dans le flow de saisie quotidien de Mehdi. Posté contre
// POST /api/admin/walkin-invoice avec un Idempotency-Key généré côté
// client (crypto.randomUUID quand dispo, fallback ts-aleatoire).
//
// Architecture :
//   - 3 steps state-machine (1: Client, 2: Items, 3: Paiement)
//   - Multi-items dynamiques avec total live recalculé
//   - DISCOUNT items : unitPrice négatif autorisé, validation interdit
//     un total facture <= 0
//   - Client : "existant" (ClientSearchSelect) / "anonyme" (nom libre)
//   - Paiement : 4 boutons radio (CASH/CARD/CHECK/TRANSFER) + datepicker
//   - Submit : redirect /admin/billing + toast (router.refresh pour
//     faire apparaître la nouvelle facture)

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Plus, Trash2, ArrowLeft, ArrowRight, Check, Loader2, Receipt } from 'lucide-react';
import ClientSearchSelect from './ClientSearchSelect';
import { formatMAD } from '@/lib/utils';
import { casablancaYMD } from '@/lib/dates-casablanca';

type ItemCategory = 'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT' | 'OTHER' | 'DISCOUNT';
type PaymentMethod = 'CASH' | 'CARD' | 'CHECK' | 'TRANSFER';

interface WalkinItem {
  id: string; // local row key
  category: ItemCategory;
  description: string;
  quantity: number;
  unitPrice: number;
}

interface Props {
  locale: string;
}

const CATEGORY_LABELS: Record<ItemCategory, { fr: string; en: string }> = {
  BOARDING:   { fr: 'Pension',     en: 'Boarding' },
  PET_TAXI:   { fr: 'Pet Taxi',    en: 'Pet Taxi' },
  GROOMING:   { fr: 'Toilettage',  en: 'Grooming' },
  PRODUCT:    { fr: 'Croquettes / Produit', en: 'Food / Product' },
  OTHER:      { fr: 'Autre',       en: 'Other' },
  DISCOUNT:   { fr: 'Remise',      en: 'Discount' },
};

const METHOD_LABELS: Record<PaymentMethod, { fr: string; en: string; emoji: string }> = {
  CASH:     { fr: 'Espèces',  en: 'Cash',     emoji: '💵' },
  CARD:     { fr: 'Carte',    en: 'Card',     emoji: '💳' },
  CHECK:    { fr: 'Chèque',   en: 'Check',    emoji: '📃' },
  TRANSFER: { fr: 'Virement', en: 'Transfer', emoji: '🏦' },
};

function newItemId(): string {
  return `it_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `walkin_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

/** Today in Casa, formatted as YYYY-MM-DD for the <input type="date"> default. */
function todayCasaYmd(): string {
  const { year, month, day } = casablancaYMD(new Date());
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function WalkinInvoiceModal({ locale }: Props) {
  const fr = locale === 'fr';
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [clientMode, setClientMode] = useState<'existing' | 'anonymous'>('existing');
  const [clientId, setClientId] = useState<string>('');
  const [anonName, setAnonName] = useState<string>('');

  // Step 2
  const [items, setItems] = useState<WalkinItem[]>([
    { id: newItemId(), category: 'PRODUCT', description: '', quantity: 1, unitPrice: 0 },
  ]);

  // Step 3
  const [paymentDate, setPaymentDate] = useState<string>(todayCasaYmd());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [notes, setNotes] = useState<string>('');

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Confirmation screen toggle — clicking "Encaisser" on step 3 flips this to
  // true and the body shows a read-only recap. Mehdi has to click "Confirmer"
  // a second time to actually fire the POST. Source : audit Wroblewski O1 —
  // money mutations must never be one-click reachable from a typo Tab-Enter.
  const [confirming, setConfirming] = useState(false);

  // Reset when modal closes — fresh state on reopen.
  useEffect(() => {
    if (!open) {
      setStep(1);
      setClientMode('existing');
      setClientId('');
      setAnonName('');
      setItems([{ id: newItemId(), category: 'PRODUCT', description: '', quantity: 1, unitPrice: 0 }]);
      setPaymentDate(todayCasaYmd());
      setPaymentMethod('CASH');
      setNotes('');
      setSubmitting(false);
      setError(null);
      setConfirming(false);
    }
  }, [open]);

  const total = useMemo(() => {
    const t = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    return Math.round(t * 100) / 100;
  }, [items]);

  // Validation flags
  const step1Valid = clientMode === 'existing' ? !!clientId : true;
  const step2Valid = useMemo(() => {
    if (items.length === 0) return false;
    if (items.some((it) => !it.description.trim() || it.quantity <= 0)) return false;
    // Negative unitPrice only for DISCOUNT.
    if (items.some((it) => it.category === 'DISCOUNT' ? it.unitPrice >= 0 : it.unitPrice < 0)) return false;
    // Net total must be strictly positive.
    if (total <= 0) return false;
    // If there's a DISCOUNT, at least one non-DISCOUNT item must exist.
    const hasDiscount = items.some((it) => it.category === 'DISCOUNT');
    const hasNonDiscount = items.some((it) => it.category !== 'DISCOUNT');
    if (hasDiscount && !hasNonDiscount) return false;
    return true;
  }, [items, total]);
  const step3Valid = !!paymentMethod && !!paymentDate;

  function addItem() {
    setItems((prev) => [...prev, { id: newItemId(), category: 'PRODUCT', description: '', quantity: 1, unitPrice: 0 }]);
  }
  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }
  function updateItem(id: string, patch: Partial<WalkinItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const idempotencyKey = newIdempotencyKey();
      const body = {
        clientId: clientMode === 'existing' ? clientId : null,
        clientName: clientMode === 'anonymous' && anonName.trim() ? anonName.trim() : null,
        paymentDate: new Date(`${paymentDate}T12:00:00+01:00`).toISOString(),
        paymentMethod,
        items: items.map((it) => ({
          category: it.category,
          description: it.description.trim(),
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
        notes: notes.trim() || null,
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
        setError(data.error || 'UNKNOWN_ERROR');
        setSubmitting(false);
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
      setError(err instanceof Error ? err.message : 'NETWORK_ERROR');
      setSubmitting(false);
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
                  {fr ? `Étape ${step} sur 3` : `Step ${step} of 3`}
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
                    s <= step ? 'bg-[#C4974A]' : 'bg-[#F5EAD0]'
                  }`}
                />
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {step === 1 && (
                <Step1Client
                  fr={fr}
                  locale={locale}
                  mode={clientMode}
                  onModeChange={setClientMode}
                  clientId={clientId}
                  onClientIdChange={setClientId}
                  anonName={anonName}
                  onAnonNameChange={setAnonName}
                />
              )}
              {step === 2 && (
                <Step2Items
                  fr={fr}
                  items={items}
                  total={total}
                  onAdd={addItem}
                  onRemove={removeItem}
                  onUpdate={updateItem}
                />
              )}
              {step === 3 && !confirming && (
                <Step3Payment
                  fr={fr}
                  paymentDate={paymentDate}
                  onPaymentDateChange={setPaymentDate}
                  paymentMethod={paymentMethod}
                  onPaymentMethodChange={setPaymentMethod}
                  notes={notes}
                  onNotesChange={setNotes}
                  total={total}
                />
              )}
              {step === 3 && confirming && (
                <ConfirmStep
                  fr={fr}
                  total={total}
                  paymentMethod={paymentMethod}
                  paymentDate={paymentDate}
                  clientLabel={
                    clientMode === 'existing'
                      ? (fr ? 'Client existant sélectionné' : 'Existing client selected')
                      : anonName.trim() || (fr ? 'Anonyme' : 'Anonymous')
                  }
                  itemCount={items.length}
                />
              )}

              {error && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {fr ? 'Erreur :' : 'Error:'} <strong>{error}</strong>
                </div>
              )}
            </div>

            {/* Footer nav. On the confirm screen, "Back" exits the confirm
                view (returns to the editable form) and the primary CTA
                becomes "Confirm & cash in" which fires the POST. */}
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[#F0D98A]/30 bg-[#FBF5E0]/30">
              {(step > 1 || confirming) ? (
                <button
                  type="button"
                  onClick={() => {
                    if (confirming) setConfirming(false);
                    else setStep((s) => (s - 1) as 1 | 2 | 3);
                  }}
                  disabled={submitting}
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
                  {fr ? 'Total' : 'Total'} <strong className="text-charcoal">{formatMAD(total)}</strong>
                </span>
                {step < 3 ? (
                  <button
                    type="button"
                    onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
                    disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-[#C4974A] text-white text-sm font-medium hover:bg-[#9A7235] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {fr ? 'Suivant' : 'Next'}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : !confirming ? (
                  // First click on step 3 : open the read-only recap. We
                  // intentionally do NOT call submit() here — money mutations
                  // need an explicit second click on the recap screen.
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    disabled={!step1Valid || !step2Valid || !step3Valid || submitting}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-[#C4974A] text-white text-sm font-medium hover:bg-[#9A7235] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {fr ? 'Encaisser' : 'Cash in'}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={submit}
                    disabled={submitting}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
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

// ────────────────────────────────────────────────────────────────────
// Step 1 — Client (existant / anonyme)
// ────────────────────────────────────────────────────────────────────
function Step1Client({
  fr, locale, mode, onModeChange, clientId, onClientIdChange, anonName, onAnonNameChange,
}: {
  fr: boolean;
  locale: string;
  mode: 'existing' | 'anonymous';
  onModeChange: (m: 'existing' | 'anonymous') => void;
  clientId: string;
  onClientIdChange: (id: string) => void;
  anonName: string;
  onAnonNameChange: (n: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2 p-1 bg-[#F5EAD0]/40 rounded-lg">
        <button
          type="button"
          onClick={() => onModeChange('existing')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === 'existing' ? 'bg-white shadow-sm text-charcoal' : 'text-gray-500'
          }`}
        >
          {fr ? '👤 Client existant' : '👤 Existing client'}
        </button>
        <button
          type="button"
          onClick={() => onModeChange('anonymous')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === 'anonymous' ? 'bg-white shadow-sm text-charcoal' : 'text-gray-500'
          }`}
        >
          {fr ? '👻 Client anonyme' : '👻 Anonymous'}
        </button>
      </div>

      {mode === 'existing' ? (
        <div>
          <label className="block text-xs font-medium text-charcoal mb-1.5">
            {fr ? 'Rechercher un client (nom / email)' : 'Search client (name / email)'}
          </label>
          <ClientSearchSelect
            value={clientId}
            onChange={onClientIdChange}
            locale={locale}
          />
          <p className="text-xs text-gray-500 mt-1.5">
            {fr
              ? 'La facture apparaîtra dans l’historique de ce client.'
              : 'The invoice will appear in this client’s history.'}
          </p>
        </div>
      ) : (
        <div>
          <label className="block text-xs font-medium text-charcoal mb-1.5">
            {fr ? 'Nom (optionnel)' : 'Name (optional)'}
          </label>
          <input
            type="text"
            value={anonName}
            onChange={(e) => onAnonNameChange(e.target.value)}
            placeholder={fr ? 'Ex : passage, particulier…' : 'E.g. walk-in, guest…'}
            className="w-full px-3 py-2 rounded-lg border border-[#E2C048]/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
            maxLength={120}
          />
          <p className="text-xs text-gray-500 mt-1.5">
            {fr
              ? 'La facture sera rattachée au client générique "Walk-in anonyme".'
              : 'The invoice will be attached to the shared "Walk-in anonymous" client.'}
          </p>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Step 2 — Items (multi-lignes + remise)
// ────────────────────────────────────────────────────────────────────
function Step2Items({
  fr, items, total, onAdd, onRemove, onUpdate,
}: {
  fr: boolean;
  items: WalkinItem[];
  total: number;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<WalkinItem>) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((it) => {
        const isDiscount = it.category === 'DISCOUNT';
        const lineTotal = Math.round(it.quantity * it.unitPrice * 100) / 100;
        return (
          <div
            key={it.id}
            className={`p-3 rounded-lg border ${
              isDiscount ? 'border-red-200 bg-red-50/30' : 'border-[#F0D98A]/40 bg-white'
            }`}
          >
            <div className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-12 md:col-span-3">
                <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">
                  {fr ? 'Catégorie' : 'Category'}
                </label>
                <select
                  value={it.category}
                  onChange={(e) => {
                    const next = e.target.value as ItemCategory;
                    // When switching to/from DISCOUNT, normalise unitPrice sign.
                    let unit = it.unitPrice;
                    if (next === 'DISCOUNT' && unit >= 0) unit = -Math.abs(unit) || -1;
                    if (next !== 'DISCOUNT' && unit < 0) unit = Math.abs(unit);
                    onUpdate(it.id, { category: next, unitPrice: unit });
                  }}
                  className="w-full px-2 py-1.5 rounded-md border border-[#E2C048]/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
                >
                  {(Object.keys(CATEGORY_LABELS) as ItemCategory[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {fr ? CATEGORY_LABELS[cat].fr : CATEGORY_LABELS[cat].en}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 md:col-span-5">
                <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">
                  {fr ? 'Description' : 'Description'}
                </label>
                <input
                  type="text"
                  value={it.description}
                  onChange={(e) => onUpdate(it.id, { description: e.target.value })}
                  placeholder={fr ? 'Ex : Croquettes Royal Canin 10kg' : 'E.g. Royal Canin 10kg'}
                  className="w-full px-2 py-1.5 rounded-md border border-[#E2C048]/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
                  maxLength={200}
                />
              </div>
              <div className="col-span-4 md:col-span-1">
                <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">
                  {fr ? 'Qté' : 'Qty'}
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={it.quantity}
                  onChange={(e) => onUpdate(it.id, { quantity: Math.max(1, parseInt(e.target.value || '1', 10) || 1) })}
                  className="w-full px-2 py-1.5 rounded-md border border-[#E2C048]/40 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
                />
              </div>
              <div className="col-span-5 md:col-span-2">
                <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">
                  {fr ? 'Prix unit.' : 'Unit'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={it.unitPrice}
                  onChange={(e) => onUpdate(it.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                  className={`w-full px-2 py-1.5 rounded-md border text-sm tabular-nums focus:outline-none focus:ring-2 ${
                    isDiscount ? 'border-red-300 text-red-700 focus:ring-red-300' : 'border-[#E2C048]/40 focus:ring-[#C4974A]/40'
                  }`}
                />
              </div>
              <div className="col-span-3 md:col-span-1 flex items-end justify-end gap-1">
                <button
                  type="button"
                  onClick={() => onRemove(it.id)}
                  disabled={items.length === 1}
                  className="p-1.5 rounded-md text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={fr ? 'Supprimer' : 'Delete'}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-2 text-right text-xs text-gray-500 tabular-nums">
              {fr ? 'Sous-total' : 'Subtotal'} :{' '}
              <span className={`font-semibold ${isDiscount ? 'text-red-600' : 'text-charcoal'}`}>
                {formatMAD(lineTotal)}
              </span>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={onAdd}
        className="w-full inline-flex items-center justify-center gap-1 py-2 rounded-lg border-2 border-dashed border-[#E2C048]/40 text-sm text-[#C4974A] hover:bg-[#FBF5E0]/40 font-medium"
      >
        <Plus className="h-4 w-4" />
        {fr ? 'Ajouter une ligne' : 'Add a line'}
      </button>

      <div className="flex items-baseline justify-between pt-3 border-t border-[#F0D98A]/30">
        <span className="text-sm font-medium text-charcoal">
          {fr ? 'Total facture' : 'Invoice total'}
        </span>
        <span className={`text-xl font-bold tabular-nums ${total <= 0 ? 'text-red-600' : 'text-emerald-700'}`}>
          {formatMAD(total)}
        </span>
      </div>
      {total <= 0 && (
        <p className="text-xs text-red-600 text-right">
          {fr ? 'Le total doit être strictement positif.' : 'Total must be strictly positive.'}
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Step 3 — Paiement (date + méthode + notes)
// ────────────────────────────────────────────────────────────────────
function Step3Payment({
  fr, paymentDate, onPaymentDateChange, paymentMethod, onPaymentMethodChange, notes, onNotesChange, total,
}: {
  fr: boolean;
  paymentDate: string;
  onPaymentDateChange: (d: string) => void;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (m: PaymentMethod) => void;
  notes: string;
  onNotesChange: (n: string) => void;
  total: number;
}) {
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
// ConfirmStep — read-only recap shown after step 3, before POST. Source
// audit Wroblewski O1 : money mutations must never be one-click reachable
// from a typo Tab-Enter. The CTA on this screen carries the final intent.
// ────────────────────────────────────────────────────────────────────
function ConfirmStep({
  fr, total, paymentMethod, paymentDate, clientLabel, itemCount,
}: {
  fr: boolean;
  total: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  clientLabel: string;
  itemCount: number;
}) {
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
