'use client';

import { type Product, t } from './types';

interface Props {
  locale: string;
  target: Product | null; // null = closed
  delta: string;
  setDelta: (v: string) => void;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Stock adjust modal — applies a signed delta (+10, -5) to the product
 * stock. Preview line shows the resulting stock so the operator can
 * sanity-check before confirming.
 *
 * Stock floor is 0 (no negative stock). Parent enforces this in onConfirm.
 */
export function StockAdjustModal({ locale, target, delta, setDelta, busy, onConfirm, onClose }: Props) {
  if (!target) return null;
  const parsed = parseInt(delta, 10);
  const previewValid = delta !== '' && !isNaN(parsed);
  const newStock = previewValid ? Math.max(0, target.stock + parsed) : target.stock;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-6 space-y-4">
        <h2 className="font-semibold text-charcoal">
          {t('Ajuster le stock', 'Adjust stock', locale)} —{' '}
          <span className="text-gold-600">{target.name}</span>
        </h2>
        <p className="text-sm text-gray-500">
          {t('Stock actuel', 'Current stock', locale)} :{' '}
          <span className="font-semibold text-charcoal">{target.stock}</span>
        </p>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {t('Delta (+/−)', 'Delta (+/−)', locale)}
          </label>
          <input
            type="number"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder="+10 ou -5"
            className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
          />
          {previewValid && (
            <p className="text-xs text-gray-400 mt-1">
              → {t('Nouveau stock', 'New stock', locale)} : {newStock}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            {t('Annuler', 'Cancel', locale)}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || !previewValid}
            className="px-3 py-1.5 text-sm bg-charcoal text-white rounded-lg disabled:opacity-50"
          >
            {busy ? '…' : t('Confirmer', 'Confirm', locale)}
          </button>
        </div>
      </div>
    </div>
  );
}
