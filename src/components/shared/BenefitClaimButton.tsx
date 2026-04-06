'use client';

import { useState } from 'react';
import { Check, Clock, X, Gift } from 'lucide-react';

interface Claim {
  benefitKey: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface BenefitClaimButtonProps {
  benefitKey: string;
  labelFr: string;
  labelEn: string;
  locale: string;
  existingClaim?: Claim;
  isPlatinum: boolean;
  titleColor: string;
  textColor: string;
}

export function BenefitClaimButton({
  benefitKey, labelFr, labelEn, locale, existingClaim, isPlatinum, titleColor, textColor,
}: BenefitClaimButtonProps) {
  const [claim, setClaim] = useState<Claim | undefined>(existingClaim);
  const [loading, setLoading] = useState(false);
  const fr = locale === 'fr';
  const label = fr ? labelFr : labelEn;

  async function handleClaim() {
    setLoading(true);
    try {
      const res = await fetch('/api/loyalty/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ benefitKey }),
      });
      if (res.ok) {
        setClaim({ benefitKey, status: 'PENDING' });
      }
    } finally {
      setLoading(false);
    }
  }

  const baseText = isPlatinum ? 'text-[#E8E0CC]/80' : `${textColor}/80`;

  if (claim?.status === 'PENDING') {
    return (
      <div className={`flex items-center justify-between gap-2 text-xs ${baseText}`}>
        <span className="flex items-center gap-1.5">
          <Clock className={`h-3 w-3 flex-shrink-0 ${isPlatinum ? 'text-[#D4AF37]' : titleColor}`} />
          {label}
        </span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${isPlatinum ? 'bg-white/10 text-[#D4AF37]' : 'bg-amber-50 text-amber-700'}`}>
          {fr ? 'En attente' : 'Pending'}
        </span>
      </div>
    );
  }

  if (claim?.status === 'APPROVED') {
    return (
      <div className={`flex items-center justify-between gap-2 text-xs ${baseText}`}>
        <span className="flex items-center gap-1.5">
          <Check className={`h-3 w-3 flex-shrink-0 ${isPlatinum ? 'text-[#D4AF37]' : titleColor}`} />
          {label}
        </span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${isPlatinum ? 'bg-white/10 text-green-400' : 'bg-green-50 text-green-700'}`}>
          {fr ? 'Validé' : 'Approved'}
        </span>
      </div>
    );
  }

  if (claim?.status === 'REJECTED') {
    return (
      <div className={`flex items-center justify-between gap-2 text-xs ${baseText}`}>
        <span className="flex items-center gap-1.5">
          <X className={`h-3 w-3 flex-shrink-0 text-red-400`} />
          {label}
        </span>
        <button
          onClick={handleClaim}
          disabled={loading}
          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${isPlatinum ? 'bg-white/10 text-[#D4AF37] hover:bg-white/20' : 'bg-gold-50 text-gold-700 hover:bg-gold-100'} transition-colors`}
        >
          {fr ? 'Réclamer' : 'Claim'}
        </button>
      </div>
    );
  }

  // No claim yet
  return (
    <div className={`flex items-center justify-between gap-2 text-xs ${baseText}`}>
      <span className="flex items-center gap-1.5">
        <Gift className={`h-3 w-3 flex-shrink-0 ${isPlatinum ? 'text-[#D4AF37]' : titleColor}`} />
        {label}
      </span>
      <button
        onClick={handleClaim}
        disabled={loading}
        className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
          isPlatinum
            ? 'bg-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37]/30'
            : 'bg-gold-50 text-gold-700 hover:bg-gold-100 border border-gold-200'
        }`}
      >
        {loading ? '...' : (fr ? 'Réclamer' : 'Claim')}
      </button>
    </div>
  );
}
