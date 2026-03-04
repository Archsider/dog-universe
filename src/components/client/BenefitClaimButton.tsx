'use client';

import { useState } from 'react';
import { Loader2, CheckCircle2, Clock } from 'lucide-react';

interface BenefitClaimButtonProps {
  benefitKey: string;
  existingStatus?: string | null; // 'PENDING' | 'APPROVED' | undefined
  quotaReached: boolean;
  locale: string;
}

export function BenefitClaimButton({ benefitKey, existingStatus, quotaReached, locale }: BenefitClaimButtonProps) {
  const isFr = locale !== 'en';
  const [status, setStatus] = useState<string | null>(existingStatus ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = isFr
    ? { use: 'Utiliser', pending: 'En attente…', used: 'Utilisé', errAlreadyPending: 'Demande déjà en cours', errQuota: 'Quota annuel atteint', errGeneric: 'Erreur, réessayez' }
    : { use: 'Use', pending: 'Pending…', used: 'Used', errAlreadyPending: 'Request already pending', errQuota: 'Annual quota reached', errGeneric: 'Error, please retry' };

  if (status === 'APPROVED' || quotaReached) {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t.used}
      </span>
    );
  }

  if (status === 'PENDING') {
    return (
      <span className="flex items-center gap-1 text-xs text-amber-500 font-medium">
        <Clock className="h-3.5 w-3.5" />
        {t.pending}
      </span>
    );
  }

  async function handleClaim() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/client/benefit-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ benefitKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'ALREADY_PENDING') setError(t.errAlreadyPending);
        else if (data.error === 'QUOTA_EXCEEDED') setError(t.errQuota);
        else setError(t.errGeneric);
        return;
      }
      setStatus('PENDING');
    } catch {
      setError(t.errGeneric);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        onClick={handleClaim}
        disabled={loading}
        className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gold-50 border border-gold-200 text-gold-700 hover:bg-gold-100 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {t.use}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
