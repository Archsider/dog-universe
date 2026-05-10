'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Percent, X } from 'lucide-react';

interface Props {
  invoiceId: string;
  hasDiscount: boolean;
  locale: string;
  disabled?: boolean;
}

/**
 * Bouton + modal pour appliquer/retirer une remise sur une facture.
 *   - MAD fixe : ex 200 MAD
 *   - % : ex 10% du sous-total (calculé côté serveur)
 *
 * Une seule remise par facture (l'API remplace si elle existe déjà).
 */
export default function DiscountButton({ invoiceId, hasDiscount, locale, disabled }: Props) {
  const router = useRouter();
  const fr = locale === 'fr';
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'AMOUNT' | 'PERCENT'>('AMOUNT');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setType('AMOUNT');
    setValue('');
    setReason('');
    setError(null);
  }

  async function apply() {
    const num = parseFloat(value);
    if (!isFinite(num) || num <= 0) {
      setError(fr ? 'Valeur invalide.' : 'Invalid value.');
      return;
    }
    if (type === 'PERCENT' && num > 100) {
      setError(fr ? 'Le pourcentage ne peut pas dépasser 100.' : 'Percent must be ≤ 100.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/discount`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, value: num, reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? 'ERROR');
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      const code = err instanceof Error ? err.message : 'ERROR';
      setError(
        code === 'AMOUNT_BELOW_PAID'         ? (fr ? 'Remise refusée : le montant deviendrait inférieur à ce qui est déjà encaissé.' : 'Refused: amount would be below paid.')
        : code === 'DISCOUNT_EXCEEDS_SUBTOTAL' ? (fr ? 'La remise dépasse le sous-total.' : 'Discount exceeds subtotal.')
        : code === 'INVOICE_CANCELLED'        ? (fr ? 'Facture annulée.' : 'Invoice cancelled.')
        : code === 'PERCENT_OVER_100'         ? (fr ? 'Le pourcentage doit être ≤ 100.' : 'Percent must be ≤ 100.')
        : code === 'INVALID_DISCOUNT_AMOUNT'  ? (fr ? 'Montant de remise invalide.' : 'Invalid discount amount.')
        : (fr ? "Erreur lors de l'application." : 'Failed to apply.'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(fr ? 'Retirer la remise ?' : 'Remove the discount?')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/discount`, { method: 'DELETE' });
      if (!res.ok) throw new Error('ERROR');
      router.refresh();
    } catch {
      setError(fr ? 'Échec de la suppression.' : 'Failed to remove.');
    } finally {
      setBusy(false);
    }
  }

  if (hasDiscount) {
    return (
      <button
        type="button"
        onClick={remove}
        disabled={busy || disabled}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-red-200 text-red-700 hover:bg-red-50 text-xs disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
        {fr ? 'Retirer la remise' : 'Remove discount'}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy || disabled}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-gold-300 text-gold-800 hover:bg-gold-50 text-xs disabled:opacity-50"
      >
        <Percent className="h-3.5 w-3.5" />
        {fr ? 'Ajouter une remise' : 'Add discount'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-3 border-b border-ivory-100">
              <h3 className="font-semibold text-charcoal">
                {fr ? 'Appliquer une remise' : 'Apply discount'}
              </h3>
              <button onClick={() => { setOpen(false); reset(); }} className="text-gray-400 hover:text-charcoal">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {fr ? 'Type de remise' : 'Discount type'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setType('AMOUNT')}
                    className={`px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                      type === 'AMOUNT'
                        ? 'bg-charcoal text-white border-charcoal'
                        : 'bg-white text-charcoal border-ivory-200 hover:border-charcoal/40'
                    }`}
                  >
                    {fr ? 'Montant fixe (MAD)' : 'Fixed amount (MAD)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('PERCENT')}
                    className={`px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                      type === 'PERCENT'
                        ? 'bg-charcoal text-white border-charcoal'
                        : 'bg-white text-charcoal border-ivory-200 hover:border-charcoal/40'
                    }`}
                  >
                    {fr ? 'Pourcentage (%)' : 'Percent (%)'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {type === 'AMOUNT' ? (fr ? 'Montant en MAD' : 'Amount in MAD') : (fr ? 'Pourcentage' : 'Percent')}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    step={type === 'PERCENT' ? 0.5 : 1}
                    max={type === 'PERCENT' ? 100 : 999999}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={type === 'PERCENT' ? '10' : '200'}
                    className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm pr-12 focus:outline-none focus:ring-1 focus:ring-gold-400"
                    autoFocus
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                    {type === 'PERCENT' ? '%' : 'MAD'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {fr ? 'Raison (optionnel)' : 'Reason (optional)'}
                </label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={fr ? 'fidélité, geste commercial…' : 'loyalty, goodwill…'}
                  maxLength={200}
                  className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
                />
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2 py-1.5">{error}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-ivory-100">
              <button
                type="button"
                onClick={() => { setOpen(false); reset(); }}
                className="px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100"
              >
                {fr ? 'Annuler' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={busy || !value}
                className="px-3 py-1.5 rounded-md bg-charcoal text-white text-sm font-medium disabled:opacity-50"
              >
                {busy ? '…' : (fr ? 'Appliquer' : 'Apply')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
