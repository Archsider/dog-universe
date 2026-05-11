'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PAYMENT_METHODS } from './types';

interface MarkPaidSectionProps {
  markPaid: boolean;
  paymentMethod: string;
  paidAt: string;
  locale: string;
  onMarkPaidChange: (v: boolean) => void;
  onPaymentMethodChange: (v: string) => void;
  onPaidAtChange: (v: string) => void;
}

export function MarkPaidSection({
  markPaid,
  paymentMethod,
  paidAt,
  locale,
  onMarkPaidChange,
  onPaymentMethodChange,
  onPaidAtChange,
}: MarkPaidSectionProps) {
  const fr = locale === 'fr';

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={markPaid}
          onChange={e => onMarkPaidChange(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-gold-500"
        />
        <span className="text-sm font-medium text-charcoal">
          {fr ? 'Marquer comme payée immédiatement' : 'Mark as paid immediately'}
        </span>
      </label>

      {markPaid && (
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <Label className="text-xs">{fr ? 'Moyen de paiement' : 'Payment method'}</Label>
            <select
              value={paymentMethod}
              onChange={e => onPaymentMethodChange(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-md text-sm px-3 py-2 focus:outline-none focus:border-gold-400 bg-white"
            >
              {PAYMENT_METHODS.map(m => (
                <option key={m.value} value={m.value}>{fr ? m.fr : m.en}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">{fr ? 'Date de paiement' : 'Payment date'}</Label>
            <Input
              type="date"
              value={paidAt}
              onChange={e => onPaidAtChange(e.target.value)}
              className="mt-1 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
