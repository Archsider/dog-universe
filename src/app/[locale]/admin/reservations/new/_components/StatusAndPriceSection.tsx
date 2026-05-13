'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { InitialStatus, Translations } from './types';

interface Props {
  t: Translations;
  initialStatus: InitialStatus;
  setInitialStatus: (s: InitialStatus) => void;
  setIsOpenEnded: (v: boolean) => void; // COMPLETED forces open-ended off
  effectiveIsOpenEnded: boolean;
  finalAmount: string;
  setFinalAmount: (v: string) => void;
  totalPrice: string;
  setTotalPrice: (v: string) => void;
  createInvoice: boolean;
  setCreateInvoice: (v: boolean) => void;
  suggestedPrice: number;
}

const STATUS_OPTIONS = [
  { value: 'IN_PROGRESS', color: 'border-green-400 bg-green-50' },
  { value: 'CONFIRMED',   color: 'border-blue-400 bg-blue-50' },
  { value: 'COMPLETED',   color: 'border-gray-400 bg-gray-50' },
  // PENDING is special: disabled when open-ended (an open-ended walk-in
  // can't be "pending", it's already at the pension).
  { value: 'PENDING',     color: 'border-amber-400 bg-amber-50' },
] as const;

/**
 * Initial status + retroactive amount + price section.
 *
 * Three layouts depending on initialStatus:
 *   - COMPLETED  → retro amount card (with suggested-price shortcut)
 *   - other      → price card (with create-invoice toggle)
 *   - open-ended → price card displays the open-ended note instead of inputs
 *
 * Combined into a single component because retro-amount and price are
 * mutually exclusive views of "how do we bill this".
 */
export function StatusAndPriceSection({
  t,
  initialStatus,
  setInitialStatus,
  setIsOpenEnded,
  effectiveIsOpenEnded,
  finalAmount,
  setFinalAmount,
  totalPrice,
  setTotalPrice,
  createInvoice,
  setCreateInvoice,
  suggestedPrice,
}: Props) {
  return (
    <>
      <section className="bg-white rounded-xl border border-ivory-200 p-5 shadow-card">
        <h2 className="text-lg font-semibold text-charcoal mb-1">{t.statusSection}</h2>
        <p className="text-xs text-gray-500 mb-3">{t.statusHelp}</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {STATUS_OPTIONS.map(({ value, color }) => {
            const label =
              value === 'IN_PROGRESS' ? t.statusInProgress :
              value === 'CONFIRMED'   ? t.statusConfirmed   :
              value === 'COMPLETED'   ? t.statusCompleted   :
              t.statusPending;
            const disabled = value === 'PENDING' && effectiveIsOpenEnded;
            return (
              <label
                key={value}
                className={`flex items-center gap-2 border rounded-lg p-3 cursor-pointer transition-colors ${initialStatus === value ? color : 'border-ivory-200'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <input
                  type="radio"
                  name="initialStatus"
                  value={value}
                  checked={initialStatus === value}
                  disabled={disabled}
                  onChange={() => {
                    setInitialStatus(value);
                    if (value === 'COMPLETED') setIsOpenEnded(false);
                  }}
                  className="h-4 w-4"
                />
                <span className="text-sm">{label}</span>
              </label>
            );
          })}
        </div>
      </section>

      {initialStatus === 'COMPLETED' && (
        <section className="bg-white rounded-xl border border-amber-200 p-5 shadow-card">
          <h2 className="text-lg font-semibold text-charcoal mb-1">{t.retroAmountSection}</h2>
          <p className="text-xs text-amber-700 mb-3">{t.retroAmountHelp}</p>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="final-amount">{t.retroAmount} *</Label>
              <Input
                id="final-amount"
                type="number"
                min="0"
                step="0.01"
                value={finalAmount}
                onChange={(e) => setFinalAmount(e.target.value)}
                required
              />
            </div>
            {suggestedPrice > 0 && (
              <button
                type="button"
                onClick={() => setFinalAmount(String(suggestedPrice))}
                className="text-xs text-gold-600 hover:text-gold-700 underline pb-2"
              >
                {t.suggested}: {suggestedPrice} MAD
              </button>
            )}
          </div>
        </section>
      )}

      {initialStatus !== 'COMPLETED' && (
        <section className="bg-white rounded-xl border border-ivory-200 p-5 shadow-card">
          <h2 className="text-lg font-semibold text-charcoal mb-3">{t.priceSection}</h2>
          {effectiveIsOpenEnded ? (
            <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-4 py-3">
              {t.openEndedNote}
            </p>
          ) : (
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label htmlFor="price">{t.totalPrice} *</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalPrice}
                  onChange={(e) => setTotalPrice(e.target.value)}
                  required
                />
              </div>
              {suggestedPrice > 0 && (
                <button
                  type="button"
                  onClick={() => setTotalPrice(String(suggestedPrice))}
                  className="text-xs text-gold-600 hover:text-gold-700 underline pb-2"
                >
                  {t.suggested}: {suggestedPrice} MAD
                </button>
              )}
            </div>
          )}
          <label className="flex items-center gap-2 mt-3 cursor-pointer">
            <input
              type="checkbox"
              checked={createInvoice}
              onChange={(e) => setCreateInvoice(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm">{t.createInvoice}</span>
          </label>
        </section>
      )}
    </>
  );
}
