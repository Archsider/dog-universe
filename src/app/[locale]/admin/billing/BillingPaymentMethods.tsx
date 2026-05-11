import React from 'react';
import { formatMAD } from '@/lib/utils';

interface PaymentMethodStat {
  paymentMethod: string;
  _sum: { amount: number };
  _count: { id: number };
}

interface BillingPaymentMethodsProps {
  locale: string;
  paymentMethodStats: PaymentMethodStat[];
}

const METHOD_CONFIG: Record<string, { labelFr: string; labelEn: string; svg: React.ReactNode }> = {
  CASH: {
    labelFr: 'Espèces', labelEn: 'Cash',
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="2" y="6" width="20" height="12" rx="1.5" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  CARD: {
    labelFr: 'TPE / Carte', labelEn: 'Card / POS',
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="9.5" x2="22" y2="9.5" />
        <rect x="5" y="13" width="4" height="3" rx="0.5" />
      </svg>
    ),
  },
  CHECK: {
    labelFr: 'Chèque', labelEn: 'Check',
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="4" width="18" height="16" rx="1.5" />
        <line x1="6" y1="9" x2="18" y2="9" />
        <line x1="6" y1="12" x2="14" y2="12" />
      </svg>
    ),
  },
  TRANSFER: {
    labelFr: 'Virement', labelEn: 'Transfer',
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="3" y="4" width="18" height="16" rx="1.5" />
        <path d="M 7 10 L 15 10 M 13 8 L 15 10 L 13 12" />
        <path d="M 17 14 L 9 14 M 11 12 L 9 14 L 11 16" />
      </svg>
    ),
  },
};

export function BillingPaymentMethods({ locale, paymentMethodStats }: BillingPaymentMethodsProps) {
  const isFr = locale === 'fr';

  if (paymentMethodStats.length === 0) return null;

  const totalPaidByMethod = paymentMethodStats.reduce((s, r) => s + Number(r._sum.amount ?? 0), 0) || 1;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {(['CASH', 'CARD', 'CHECK', 'TRANSFER'] as const).map(method => {
        const stat = paymentMethodStats.find(s => s.paymentMethod === method);
        const amount = Number(stat?._sum.amount ?? 0);
        const count = stat?._count.id ?? 0;
        const pct = Math.round((amount / totalPaidByMethod) * 100);
        const cfg = METHOD_CONFIG[method];
        return (
          <div
            key={method}
            className="bg-white rounded-xl border border-[rgba(196,151,74,0.25)] p-4 hover:border-[#C4974A] transition-colors"
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-lg border border-[rgba(196,151,74,0.3)] text-[#C4974A] flex items-center justify-center flex-shrink-0">
                {cfg.svg}
              </div>
              <span className="text-sm font-medium text-[#2A2520]">
                {isFr ? cfg.labelFr : cfg.labelEn}
              </span>
            </div>
            <p className="text-xl font-bold text-[#2A2520]">{formatMAD(amount)}</p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-[#8A7E75]">{count} {isFr ? 'paiement(s)' : 'payment(s)'}</p>
              <span className="text-xs font-bold text-[#C4974A]">{pct}%</span>
            </div>
            <div className="h-1 bg-[#C4974A]/10 rounded-full mt-2.5 overflow-hidden">
              <div className="h-1 rounded-full bg-[#C4974A] transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
