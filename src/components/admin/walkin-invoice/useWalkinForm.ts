'use client';

// Form state hook for the walk-in invoice wizard.
//
// Owns : step navigation, client mode, items array, payment fields,
// reset on close, derived total + validation flags, idempotent item
// mutators. The submit() side-effect (fetch + toast + router.refresh)
// stays in the orchestrator because it touches `useRouter` and the
// surrounding open/close machinery.

import { useEffect, useMemo, useState } from 'react';
import { casablancaYMD } from '@/lib/dates-casablanca';
import type { ClientMode, PaymentMethod, WalkinItem } from './types';

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
export function todayCasaYmd(): string {
  const { year, month, day } = casablancaYMD(new Date());
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function makeInitialItem(): WalkinItem {
  // Default to 'OTHER' (not 'PRODUCT') so the user makes a deliberate PRODUCT
  // choice via the smart-search input. Avoids the trap "PRODUCT default →
  // free-text typed → no productId → 400 PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID
  // at submit" — enforced server-side by Zod refine + DB CHECK constraint
  // `InvoiceItem_product_category_has_productId` (Agent 1, PR #123).
  // The ProductCatalogSearchSelect component (PR #124) binds productId
  // when the user explicitly switches to PRODUCT.
  return { id: newItemId(), category: 'OTHER', description: '', quantity: 1, unitPrice: 0, productId: null };
}

export interface UseWalkinFormResult {
  // Step machine
  step: 1 | 2 | 3;
  setStep: React.Dispatch<React.SetStateAction<1 | 2 | 3>>;
  confirming: boolean;
  setConfirming: React.Dispatch<React.SetStateAction<boolean>>;

  // Step 1
  clientMode: ClientMode;
  setClientMode: (m: ClientMode) => void;
  clientId: string;
  setClientId: (id: string) => void;
  anonName: string;
  setAnonName: (n: string) => void;
  // New-client mode (creates a persistent walk-in User)
  newClientName: string;
  setNewClientName: (n: string) => void;
  newClientPhone: string;
  setNewClientPhone: (p: string) => void;

  // Step 2
  items: WalkinItem[];
  addItem: () => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, patch: Partial<WalkinItem>) => void;
  total: number;

  // Step 3
  paymentDate: string;
  setPaymentDate: (d: string) => void;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (m: PaymentMethod) => void;
  notes: string;
  setNotes: (n: string) => void;

  // Submit transport
  submitting: boolean;
  setSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;

  // Validation flags
  step1Valid: boolean;
  step2Valid: boolean;
  step3Valid: boolean;

  // Stable idempotency key for THIS form session — reused across retries
  // so a network blip + re-submit returns the replay instead of creating
  // a duplicate paid invoice. Rotated on each modal open.
  idempotencyKey: string;
}

export function useWalkinForm(open: boolean): UseWalkinFormResult {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [clientMode, setClientMode] = useState<ClientMode>('existing');
  const [clientId, setClientId] = useState<string>('');
  const [anonName, setAnonName] = useState<string>('');
  const [newClientName, setNewClientName] = useState<string>('');
  const [newClientPhone, setNewClientPhone] = useState<string>('');

  // Step 2
  const [items, setItems] = useState<WalkinItem[]>([makeInitialItem()]);

  // Step 3
  const [paymentDate, setPaymentDate] = useState<string>(todayCasaYmd());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [notes, setNotes] = useState<string>('');

  // One stable idempotency key per form session (bug fix : the api-client
  // used to mint a fresh key on every call, so a retry after a lost
  // response created a 2nd paid invoice). Rotated on modal open below.
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => newIdempotencyKey());

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Confirmation screen toggle — clicking "Encaisser" on step 3 flips this to
  // true and the body shows a read-only recap. Operator has to click
  // "Confirmer" a second time to actually fire the POST.
  // Source : audit Wroblewski O1 — money mutations must never be one-click
  // reachable from a typo Tab-Enter.
  const [confirming, setConfirming] = useState(false);

  // Reset when modal closes — fresh state on reopen.
  useEffect(() => {
    if (!open) {
      setStep(1);
      setClientMode('existing');
      setClientId('');
      setAnonName('');
      setNewClientName('');
      setNewClientPhone('');
      setItems([makeInitialItem()]);
      setPaymentDate(todayCasaYmd());
      setPaymentMethod('CASH');
      setNotes('');
      setSubmitting(false);
      setError(null);
      setConfirming(false);
      // Fresh idempotency key for the next session — a brand-new invoice,
      // not a replay of the previous one.
      setIdempotencyKey(newIdempotencyKey());
    }
  }, [open]);

  const total = useMemo(() => {
    const t = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    return Math.round(t * 100) / 100;
  }, [items]);

  // Validation flags
  // existing → a client must be picked. new → a name is required (phone
  // optional, but if filled must be a plausible phone — mirror of the loose
  // server regex in /api/admin/walkin-clients). A walk-in phone is just a
  // contact note (no login, no portal), so we tolerate foreign / landline /
  // unusual formats : 6–15 digits with an optional leading "+".
  const newPhoneValid =
    !newClientPhone.trim() || /^\+?\d{6,15}$/.test(newClientPhone.replace(/[\s.\-()]/g, ''));
  const step1Valid =
    clientMode === 'existing' ? !!clientId
    : clientMode === 'new' ? newClientName.trim().length > 0 && newPhoneValid
    : true;
  const step2Valid = useMemo(() => {
    if (items.length === 0) return false;
    if (items.some((it) => !it.description.trim() || it.quantity <= 0)) return false;
    // Negative unitPrice only for DISCOUNT.
    if (items.some((it) => it.category === 'DISCOUNT' ? it.unitPrice >= 0 : it.unitPrice < 0)) return false;
    // PRODUCT category MUST carry a productId — mirror of server Zod rule
    // PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID (Agent 1). Without this we'd
    // unblock the "Next" button just to crash at submit.
    if (items.some((it) => it.category === 'PRODUCT' && !it.productId)) return false;
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
    setItems((prev) => [...prev, makeInitialItem()]);
  }
  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }
  function updateItem(id: string, patch: Partial<WalkinItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  return {
    step, setStep, confirming, setConfirming,
    clientMode, setClientMode, clientId, setClientId, anonName, setAnonName,
    newClientName, setNewClientName, newClientPhone, setNewClientPhone,
    items, addItem, removeItem, updateItem, total,
    paymentDate, setPaymentDate, paymentMethod, setPaymentMethod, notes, setNotes,
    submitting, setSubmitting, error, setError,
    step1Valid, step2Valid, step3Valid,
    idempotencyKey,
  };
}
