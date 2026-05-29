'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle, Loader2, Banknote, CreditCard, Receipt,
  Building2, Trash2, ChevronDown, CalendarClock, Check, Pencil, X,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { Decimal } from '@prisma/client/runtime/library';
import { submitPayment } from './_lib/submit-payment';
import { casablancaYMD } from '@/lib/dates-casablanca';
import { computeSettlementYmd, explainSettlement, formatYmdLong, type SettlementMethod } from '@/lib/settlement';

interface Payment {
  id: string;
  amount: number | Decimal;
  paymentMethod: string;
  paymentDate: string;
  notes: string | null;
}

interface Props {
  invoiceId: string;
  currentStatus: string;
  locale: string;
  invoiceAmount: number | Decimal;
  paidAmount: number | Decimal;
  /** Walk-in flag of the invoice's client. When `true`, the "Envoyer SMS
   *  de confirmation" checkbox defaults to OFF — the respectful-SMS policy
   *  (ADR-0008) suppresses payment SMS for walk-ins anyway, this just
   *  surfaces that decision to the operator. Optional for backward
   *  compatibility with call sites that don't pass it yet. */
  isWalkIn?: boolean;
  /** Visual style of the trigger button. `icon` = the small ✅ used in
   *  the billing-invoices table. `full` = a labeled rectangular button
   *  used in the booking-detail invoice section. Defaults to `icon` to
   *  match the historical billing-page UX. */
  triggerVariant?: 'icon' | 'full';
}

const PAYMENT_METHODS = [
  { key: 'CASH',     Icon: Banknote,   labelFr: 'Espèces',          labelEn: 'Cash' },
  { key: 'CARD',     Icon: CreditCard, labelFr: 'Carte / TPE',      labelEn: 'Card / POS' },
  { key: 'CHECK',    Icon: Receipt,    labelFr: 'Chèque',           labelEn: 'Check' },
  { key: 'TRANSFER', Icon: Building2,  labelFr: 'Virement bancaire', labelEn: 'Bank transfer' },
] as const;

const METHOD_LABEL: Record<string, { fr: string; en: string }> = {
  CASH:     { fr: 'Espèces',  en: 'Cash' },
  CARD:     { fr: 'TPE',      en: 'Card' },
  CHECK:    { fr: 'Chèque',   en: 'Check' },
  TRANSFER: { fr: 'Virement', en: 'Transfer' },
};

function todayIso() {
  // Casa calendar day, not UTC — `toISOString` rolls to "yesterday" between
  // 23:00–00:00 UTC (00:00–01:00 Casa), mis-dating a payment into the prior
  // Casa revenue month at month boundaries.
  const { year, month, day } = casablancaYMD(new Date());
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Casablanca quiet hours mirror the server policy (src/lib/sms-policy.ts).
// Duplicated here as a pure 1-line function so the UI label updates without
// a server round-trip. Keep the constants in sync — if the server policy
// changes, update both. See ADR-0008.
const CASA_OFFSET_MINUTES = 60;
const QUIET_START = 21;
const QUIET_END = 9;
function isQuietHoursCasaClient(now: Date = new Date()): boolean {
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const casaHour = Math.floor((utcMin + CASA_OFFSET_MINUTES) / 60) % 24;
  return casaHour < QUIET_END || casaHour >= QUIET_START;
}

export default function PaymentModal({
  invoiceId, currentStatus, locale, invoiceAmount: invoiceAmountProp, paidAmount: paidAmountProp, isWalkIn, triggerVariant = 'icon',
}: Props) {
  const isFr = locale === 'fr';
  const router = useRouter();
  const invoiceAmount = Number(invoiceAmountProp);
  const paidAmount = Number(paidAmountProp);

  const [open, setOpen] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Form state
  const [method, setMethod] = useState('CASH');
  const [paymentDate, setPaymentDate] = useState(todayIso());
  // `true` tant que l'opérateur n'a pas figé la date à la main → la date
  // d'encaissement s'auto-calcule depuis le moyen de paiement (date de valeur
  // banque, weekends + fériés Maroc exclus).
  const [dateAuto, setDateAuto] = useState(true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Inline edit of an existing payment's settlement date.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDateValue, setEditDateValue] = useState('');
  const [savingDateId, setSavingDateId] = useState<string | null>(null);

  // Changement de méthode → ré-applique la date de valeur auto si non figée.
  const changeMethod = (m: string) => {
    setMethod(m);
    if (dateAuto) setPaymentDate(computeSettlementYmd(todayIso(), m as SettlementMethod));
  };
  const changeDate = (v: string) => {
    setPaymentDate(v);
    setDateAuto(false);
  };
  // SMS notification toggle. Defaults: ON for standard clients, OFF for
  // walk-ins (matches the server policy default — see ADR-0008). The
  // operator can override either way per-payment.
  const [sendClientSms, setSendClientSms] = useState<boolean>(!isWalkIn);

  // Recompute remaining from live payments (may differ from paidAmount prop after actions)
  const livePaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Math.max(0, invoiceAmount - livePaid);
  // eslint-disable-next-line dog-universe/no-money-tofixed -- OK: controlled <input> value needs a raw "12.34" string, not a localized "12,34 MAD" formatMAD output. The Decimal was already projected to number at the prop boundary.
  const [inputAmount, setInputAmount] = useState(paidAmount > 0 ? (invoiceAmount - paidAmount).toFixed(2) : invoiceAmount.toFixed(2));

  const fetchPayments = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/payments`);
      if (res.ok) {
        const data = await res.json();
        setPayments(data);
        const paid = data.reduce((s: number, p: Payment) => s + Number(p.amount), 0);
        setInputAmount(Math.max(0, invoiceAmount - paid).toFixed(2));
      }
    } finally {
      setLoadingHistory(false);
    }
  }, [invoiceId, invoiceAmount]);

  const handleOpen = async () => {
    setMethod('CASH');
    setPaymentDate(computeSettlementYmd(todayIso(), 'CASH'));
    setDateAuto(true);
    setEditingId(null);
    setNotes('');
    // Reset SMS toggle to its context-aware default on each open. Avoids
    // a sticky "I unchecked it once 3 months ago" surprise.
    setSendClientSms(!isWalkIn);
    setOpen(true);
    await fetchPayments();
  };

  const handleSubmit = async () => {
    const amount = parseFloat(inputAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: isFr ? 'Montant invalide' : 'Invalid amount', variant: 'destructive' });
      return;
    }
    if (amount > remaining + 0.001) {
      toast({ title: isFr ? 'Montant supérieur au restant dû' : 'Amount exceeds balance', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      // Single canonical entry point — also used by the booking-detail and
      // invoice-detail pages. Includes Idempotency-Key + sendClientSms.
      // See src/app/[locale]/admin/billing/_lib/submit-payment.ts.
      const result = await submitPayment({
        invoiceId,
        amount,
        paymentMethod: method as 'CASH' | 'CARD' | 'CHECK' | 'TRANSFER',
        paymentDate,
        notes: notes || null,
        sendClientSms,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
      toast({ title: isFr ? 'Paiement enregistré' : 'Payment recorded', variant: 'success' });
      setNotes('');
      await fetchPayments();
      router.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error';
      toast({ title: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (paymentId: string) => {
    setDeletingId(paymentId);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/payments/${paymentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast({ title: isFr ? 'Versement supprimé' : 'Payment deleted', variant: 'success' });
      await fetchPayments();
      router.refresh();
    } catch {
      toast({ title: isFr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const startEditDate = (paymentId: string, current: string) => {
    setEditDateValue(current.slice(0, 10));
    setEditingId(paymentId);
  };
  const handleEditDate = async (paymentId: string) => {
    if (!editDateValue) return;
    setSavingDateId(paymentId);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/payments/${paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentDate: editDateValue }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed');
      }
      toast({ title: isFr ? "Date d'encaissement mise à jour" : 'Settlement date updated', variant: 'success' });
      setEditingId(null);
      await fetchPayments();
      router.refresh();
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : (isFr ? 'Erreur' : 'Error'), variant: 'destructive' });
    } finally {
      setSavingDateId(null);
    }
  };

  // Encart : date de crédit banque estimée pour la méthode choisie (cash → rien).
  const settlement = method === 'CASH' ? null : explainSettlement(todayIso(), method as SettlementMethod);

  if (currentStatus === 'PAID' || currentStatus === 'CANCELLED') return null;

  const triggerLabel = isFr ? 'Enregistrer un paiement' : 'Record payment';

  return (
    <>
      {triggerVariant === 'icon' ? (
        <button
          onClick={handleOpen}
          className="p-1.5 text-gray-400 hover:text-green-600 rounded transition-colors"
          title={triggerLabel}
        >
          <CheckCircle className="h-4 w-4" />
        </button>
      ) : (
        <button
          onClick={handleOpen}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
        >
          <CheckCircle className="h-3.5 w-3.5" />
          {triggerLabel}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md my-8">

            {/* ── Header ── */}
            <div className="p-6 pb-4 border-b border-ivory-200">
              <h2 className="text-lg font-serif font-bold text-charcoal mb-4">
                {isFr ? 'Enregistrer un paiement' : 'Record payment'}
              </h2>
              <div className="grid grid-cols-3 divide-x divide-ivory-200 bg-ivory-50 rounded-xl overflow-hidden text-center">
                <div className="p-3">
                  <p className="text-xs text-gray-400 mb-0.5">{isFr ? 'Total facture' : 'Invoice total'}</p>
                  {/* eslint-disable-next-line dog-universe/no-money-tofixed -- OK: split layout keeps the "MAD" unit in a smaller span for visual alignment in the 3-col KPI strip ; formatMAD would inline the unit. */}
                  <p className="font-bold text-charcoal text-sm">{invoiceAmount.toFixed(2)} <span className="text-xs font-normal">MAD</span></p>
                </div>
                <div className="p-3">
                  <p className="text-xs text-gray-400 mb-0.5">{isFr ? 'Déjà réglé' : 'Already paid'}</p>
                  <p className="font-bold text-green-700 text-sm">{livePaid.toFixed(2)} <span className="text-xs font-normal">MAD</span></p>
                </div>
                <div className="p-3">
                  <p className="text-xs text-gray-400 mb-0.5">{isFr ? 'Reste à payer' : 'Remaining'}</p>
                  <p className={`font-bold text-sm ${remaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    {remaining.toFixed(2)} <span className="text-xs font-normal">MAD</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">

              {/* ── Amount ── */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  {isFr ? 'Montant (MAD)' : 'Amount (MAD)'}
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={remaining}
                  value={inputAmount}
                  onChange={e => setInputAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-300"
                />
              </div>

              {/* ── Date ── */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  {isFr ? 'Date' : 'Date'}
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={e => changeDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-300"
                />
                {settlement && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs text-gray-500">
                    <CalendarClock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-gold-500" />
                    <span>
                      {isFr ? 'Crédit banque estimé le ' : 'Estimated bank credit on '}
                      <span className="font-semibold text-charcoal">
                        {formatYmdLong(settlement.settlementYmd, isFr ? 'fr' : 'en')}
                      </span>
                      {' '}({isFr ? `+${settlement.lagBusinessDays} j ouvré` : `+${settlement.lagBusinessDays} business day`}
                      {settlement.lagBusinessDays > 1 ? (isFr ? 's' : 's') : ''}
                      {settlement.skipped.some(s => s.reason === 'holiday') ? (isFr ? ', férié inclus' : ', holiday skipped') : ''}
                      {isFr ? ', weekends exclus)' : ', weekends skipped)'}
                    </span>
                  </p>
                )}
              </div>

              {/* ── Method ── */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {isFr ? 'Mode de paiement' : 'Payment method'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map(({ key, Icon, labelFr, labelEn }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => changeMethod(key)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        method === key
                          ? 'bg-gold-50 border-gold-400 text-gold-700'
                          : 'border-gray-200 text-gray-600 hover:border-gold-300 hover:bg-ivory-50'
                      }`}
                    >
                      <Icon className={`h-4 w-4 flex-shrink-0 ${method === key ? 'text-gold-500' : 'text-gray-400'}`} />
                      {isFr ? labelFr : labelEn}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Notes ── */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  {isFr ? 'Notes (optionnel)' : 'Notes (optional)'}
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder={isFr ? 'Ex : chèque n°1234' : 'e.g. cheque #1234'}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-300"
                />
              </div>

              {/* ── Confirmation SMS toggle ── */}
              {/* Surfaces the respectful-SMS policy (ADR-0008) directly in
                  the form. The checkbox is the single source of truth: if
                  unchecked, no SMS at all. If checked, the server still
                  applies walk-in suppression + quiet-hours defer based on
                  context. The dynamic label tells the operator what will
                  actually happen so they're never surprised. */}
              <div className="rounded-lg border border-ivory-200 bg-ivory-50/50 px-3 py-2.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendClientSms}
                    onChange={(e) => setSendClientSms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gold-600 focus:ring-gold-300"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-charcoal">
                      {isFr ? 'Envoyer SMS de confirmation au client' : 'Send confirmation SMS to client'}
                    </p>
                    {isWalkIn && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        ⓘ {isFr ? 'Walk-in — SMS non recommandé' : 'Walk-in — SMS not recommended'}
                      </p>
                    )}
                    {!isWalkIn && sendClientSms && isQuietHoursCasaClient() && (
                      <p className="text-xs text-amber-700 mt-0.5">
                        ⏰ {isFr
                          ? 'Heures calmes — SMS reporté à 9h demain'
                          : 'Quiet hours — SMS deferred to 9 AM tomorrow'}
                      </p>
                    )}
                  </div>
                </label>
              </div>

              {/* ── Submit ── */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  {isFr ? 'Fermer' : 'Close'}
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || remaining <= 0}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60"
                >
                  {submitting
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <CheckCircle className="h-4 w-4" />}
                  {isFr ? 'Enregistrer' : 'Save'}
                </button>
              </div>

              {/* ── Payment history ── */}
              {(loadingHistory || payments.length > 0) && (
                <div className="border-t border-ivory-200 pt-4 mt-2">
                  <div className="flex items-center gap-1.5 mb-3">
                    <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {isFr ? 'Historique des versements' : 'Payment history'}
                    </p>
                  </div>

                  {loadingHistory ? (
                    <div className="flex justify-center py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {payments.map(p => {
                        const date = new Date(p.paymentDate).toLocaleDateString(
                          isFr ? 'fr-FR' : 'en-US',
                          { day: '2-digit', month: '2-digit', year: '2-digit' }
                        );
                        const methodLabel = METHOD_LABEL[p.paymentMethod]?.[isFr ? 'fr' : 'en'] ?? p.paymentMethod;
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between bg-ivory-50 rounded-lg px-3 py-2 text-sm"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {editingId === p.id ? (
                                <input
                                  type="date"
                                  value={editDateValue}
                                  autoFocus
                                  onChange={e => setEditDateValue(e.target.value)}
                                  className="px-2 py-0.5 border border-gold-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-gold-400"
                                />
                              ) : (
                                <span className="text-gray-500 shrink-0">{date}</span>
                              )}
                              <span className="text-gray-300">·</span>
                              <span className="text-gray-600 font-medium shrink-0">{methodLabel}</span>
                              {p.notes && (
                                <>
                                  <span className="text-gray-300">·</span>
                                  <span className="text-gray-400 truncate text-xs">{p.notes}</span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-3">
                              <span className="font-semibold text-charcoal">-{Number(p.amount).toFixed(2)} MAD</span>
                              {editingId === p.id ? (
                                <>
                                  <button
                                    onClick={() => handleEditDate(p.id)}
                                    disabled={savingDateId === p.id}
                                    className="p-1 text-green-500 hover:text-green-600 transition-colors rounded disabled:opacity-40"
                                    title={isFr ? "Enregistrer la date d'encaissement" : 'Save settlement date'}
                                  >
                                    {savingDateId === p.id
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : <Check className="h-3.5 w-3.5" />}
                                  </button>
                                  <button
                                    onClick={() => setEditingId(null)}
                                    disabled={savingDateId === p.id}
                                    className="p-1 text-gray-300 hover:text-gray-500 transition-colors rounded disabled:opacity-40"
                                    title={isFr ? 'Annuler' : 'Cancel'}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => startEditDate(p.id, p.paymentDate)}
                                    className="p-1 text-gray-300 hover:text-gold-500 transition-colors rounded"
                                    title={isFr ? "Modifier la date d'encaissement" : 'Edit settlement date'}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(p.id)}
                                    disabled={deletingId === p.id}
                                    className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded disabled:opacity-40"
                                    title={isFr ? 'Supprimer' : 'Delete'}
                                  >
                                    {deletingId === p.id
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : <Trash2 className="h-3.5 w-3.5" />}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Totals */}
                      <div className="border-t border-ivory-200 pt-2 space-y-1">
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>{isFr ? 'Total réglé' : 'Total paid'}</span>
                          <span className="font-semibold text-green-700">-{livePaid.toFixed(2)} MAD</span>
                        </div>
                        {remaining > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">{isFr ? 'Reste à payer' : 'Remaining'}</span>
                            <span className="font-bold text-orange-600">{remaining.toFixed(2)} MAD</span>
                          </div>
                        )}
                        {remaining <= 0 && (
                          <p className="text-center text-xs font-semibold text-green-600 py-1">
                            {isFr ? '✓ Payé intégralement' : '✓ Paid in full'}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
