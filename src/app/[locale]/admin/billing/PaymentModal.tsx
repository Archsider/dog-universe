'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle, Loader2, Banknote, CreditCard, Receipt,
  Building2, Trash2, ChevronDown,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Payment {
  id: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  notes: string | null;
}

interface Props {
  invoiceId: string;
  currentStatus: string;
  locale: string;
  invoiceAmount: number;
  paidAmount: number;
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
  return new Date().toISOString().slice(0, 10);
}

export default function PaymentModal({
  invoiceId, currentStatus, locale, invoiceAmount, paidAmount,
}: Props) {
  const isFr = locale === 'fr';
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Form state
  const [method, setMethod] = useState('CASH');
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Recompute remaining from live payments (may differ from paidAmount prop after actions)
  const livePaid = payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, invoiceAmount - livePaid);
  const [inputAmount, setInputAmount] = useState(paidAmount > 0 ? (invoiceAmount - paidAmount).toFixed(2) : invoiceAmount.toFixed(2));

  const fetchPayments = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/payments`);
      if (res.ok) {
        const data = await res.json();
        setPayments(data);
        const paid = data.reduce((s: number, p: Payment) => s + p.amount, 0);
        setInputAmount(Math.max(0, invoiceAmount - paid).toFixed(2));
      }
    } finally {
      setLoadingHistory(false);
    }
  }, [invoiceId, invoiceAmount]);

  const handleOpen = async () => {
    setMethod('CASH');
    setPaymentDate(todayIso());
    setNotes('');
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
      const res = await fetch(`/api/invoices/${invoiceId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, paymentMethod: method, paymentDate, notes: notes || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed');
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

  if (currentStatus === 'PAID' || currentStatus === 'CANCELLED') return null;

  return (
    <>
      <button
        onClick={handleOpen}
        className="p-1.5 text-gray-400 hover:text-green-600 rounded transition-colors"
        title={isFr ? 'Enregistrer un paiement' : 'Record payment'}
      >
        <CheckCircle className="h-4 w-4" />
      </button>

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
                  onChange={e => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-300"
                />
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
                      onClick={() => setMethod(key)}
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
                              <span className="text-gray-500 shrink-0">{date}</span>
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
                              <span className="font-semibold text-charcoal">-{p.amount.toFixed(2)} MAD</span>
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
