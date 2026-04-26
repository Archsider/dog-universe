'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Loader2, Banknote, CreditCard, Receipt, Building2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  invoiceId: string;
  currentStatus: string;
  locale: string;
  invoiceAmount: number;
  paidAmount: number;
}

const PAYMENT_METHODS = [
  { key: 'CASH',     icon: Banknote,   labelFr: 'Espèces',          labelEn: 'Cash' },
  { key: 'CARD',     icon: CreditCard, labelFr: 'Carte / TPE',      labelEn: 'Card / POS' },
  { key: 'CHECK',    icon: Receipt,    labelFr: 'Chèque',           labelEn: 'Check' },
  { key: 'TRANSFER', icon: Building2,  labelFr: 'Virement bancaire', labelEn: 'Bank transfer' },
] as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CreateInvoiceButton({ invoiceId, currentStatus, locale, invoiceAmount, paidAmount }: Props) {
  const remaining = Math.max(0, invoiceAmount - paidAmount);
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<string>('CASH');
  const [paymentDate, setPaymentDate] = useState<string>(todayIso());
  const [inputAmount, setInputAmount] = useState<string>(remaining.toFixed(2));
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (currentStatus === 'PAID' || currentStatus === 'CANCELLED') return null;

  const isFr = locale === 'fr';
  const l = {
    title: isFr ? 'Enregistrer un paiement' : 'Record payment',
    desc: isFr ? 'Montant reçu, mode et date du paiement.' : 'Amount received, method and payment date.',
    cancel: isFr ? 'Annuler' : 'Cancel',
    confirm: isFr ? 'Enregistrer' : 'Save payment',
    success: isFr ? 'Paiement enregistré' : 'Payment recorded',
    error: isFr ? 'Erreur' : 'Error',
    method: isFr ? 'Mode de paiement' : 'Payment method',
    amount: isFr ? 'Montant reçu (MAD)' : 'Amount received (MAD)',
    date: isFr ? 'Date de paiement' : 'Payment date',
    invoiceTotal: isFr ? 'Total facture' : 'Invoice total',
    alreadyPaid: isFr ? 'Déjà réglé' : 'Already paid',
    remainingLabel: isFr ? 'Restant' : 'Remaining',
  };

  const handleOpen = () => {
    setInputAmount(remaining.toFixed(2));
    setPaymentDate(todayIso());
    setMethod('CASH');
    setOpen(true);
  };

  const handleConfirm = async () => {
    const newPayment = parseFloat(inputAmount);
    if (isNaN(newPayment) || newPayment <= 0) {
      toast({ title: isFr ? 'Montant invalide' : 'Invalid amount', variant: 'destructive' });
      return;
    }
    const newTotal = paidAmount + newPayment;
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paidAmount: newTotal,
          paymentMethod: method,
          paymentDate,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: l.success, variant: 'success' });
      setOpen(false);
      router.refresh();
    } catch {
      toast({ title: l.error, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="p-1.5 text-gray-400 hover:text-green-600 rounded transition-colors"
        title={l.title}
      >
        <CheckCircle className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-serif font-bold text-charcoal mb-1">{l.title}</h2>
            <p className="text-sm text-gray-500 mb-4">{l.desc}</p>

            {/* Invoice summary */}
            <div className="bg-ivory-50 rounded-xl p-3 mb-5 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{l.invoiceTotal}</span>
                <span className="font-semibold text-charcoal">{invoiceAmount.toFixed(2)} MAD</span>
              </div>
              {paidAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">{l.alreadyPaid}</span>
                  <span className="font-medium text-green-700">{paidAmount.toFixed(2)} MAD</span>
                </div>
              )}
              <div className="flex justify-between border-t border-ivory-200 pt-1.5">
                <span className="text-gray-600 font-medium">{l.remainingLabel}</span>
                <span className="font-bold text-orange-600">{remaining.toFixed(2)} MAD</span>
              </div>
            </div>

            {/* Amount input */}
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{l.amount}</label>
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

            {/* Payment date */}
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{l.date}</label>
              <input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold-300"
              />
            </div>

            {/* Payment method */}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{l.method}</p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {PAYMENT_METHODS.map(({ key, icon: Icon, labelFr, labelEn }) => (
                <button
                  key={key}
                  onClick={() => setMethod(key)}
                  className={`flex items-center gap-2 px-3 py-3 rounded-xl border text-sm font-medium transition-all ${
                    method === key
                      ? 'bg-gold-50 border-gold-400 text-gold-700'
                      : 'border-gray-200 text-gray-600 hover:border-gold-300 hover:bg-ivory-50'
                  }`}
                >
                  <Icon className={`h-4 w-4 flex-shrink-0 ${method === key ? 'text-gold-500' : 'text-gray-400'}`} />
                  <span>{isFr ? labelFr : labelEn}</span>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                {l.cancel}
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {l.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
