'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Loader2, Banknote, CreditCard, Receipt, Building2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  invoiceId: string;
  currentStatus: string;
  locale: string;
}

const PAYMENT_METHODS = [
  { key: 'CASH',     icon: Banknote,   labelFr: 'Espèces',          labelEn: 'Cash' },
  { key: 'CARD',     icon: CreditCard, labelFr: 'Carte bancaire',   labelEn: 'Credit card' },
  { key: 'CHECK',    icon: Receipt,    labelFr: 'Chèque',           labelEn: 'Check' },
  { key: 'TRANSFER', icon: Building2,  labelFr: 'Virement bancaire', labelEn: 'Bank transfer' },
] as const;

export default function CreateInvoiceButton({ invoiceId, currentStatus, locale }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>('CASH');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (currentStatus === 'PAID' || currentStatus === 'CANCELLED') return null;

  const isFr = locale === 'fr';
  const l = {
    title: isFr ? 'Confirmer le paiement' : 'Confirm payment',
    desc: isFr ? 'Choisissez le mode de paiement utilisé.' : 'Select the payment method used.',
    cancel: isFr ? 'Annuler' : 'Cancel',
    confirm: isFr ? 'Marquer comme payée' : 'Mark as paid',
    success: isFr ? 'Facture marquée payée' : 'Invoice marked as paid',
    error: isFr ? 'Erreur' : 'Error',
    method: isFr ? 'Mode de paiement' : 'Payment method',
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PAID', paymentMethod: selected }),
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
        onClick={() => setOpen(true)}
        className="p-1.5 text-gray-400 hover:text-green-600 rounded transition-colors"
        title={l.confirm}
      >
        <CheckCircle className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-serif font-bold text-charcoal mb-1">{l.title}</h2>
            <p className="text-sm text-gray-500 mb-5">{l.desc}</p>

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{l.method}</p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {PAYMENT_METHODS.map(({ key, icon: Icon, labelFr, labelEn }) => (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={`flex items-center gap-2 px-3 py-3 rounded-xl border text-sm font-medium transition-all ${
                    selected === key
                      ? 'bg-gold-50 border-gold-400 text-gold-700'
                      : 'border-gray-200 text-gray-600 hover:border-gold-300 hover:bg-ivory-50'
                  }`}
                >
                  <Icon className={`h-4 w-4 flex-shrink-0 ${selected === key ? 'text-gold-500' : 'text-gray-400'}`} />
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
