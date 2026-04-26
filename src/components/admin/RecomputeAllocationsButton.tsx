'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function RecomputeAllocationsButton({ locale }: { locale: string }) {
  const [loading, setLoading] = useState(false);
  const isFr = locale !== 'en';

  async function handleClick() {
    if (!confirm(isFr
      ? 'Recalculer les allocations de paiement sur toutes les factures ?\nOpération sûre — aucun doublon, aucune notification.'
      : 'Recompute payment allocations on all invoices?\nSafe operation — no duplicates, no notifications.'
    )) return;

    setLoading(true);
    try {
      const res = await fetch('/api/admin/recompute-allocations', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: isFr ? 'Erreur' : 'Error', description: data.error, variant: 'destructive' });
        return;
      }
      toast({
        title: isFr ? 'Recalcul terminé' : 'Recompute done',
        description: isFr
          ? `${data.recomputed} / ${data.total} factures mises à jour${data.errors?.length ? ` — ${data.errors.length} erreur(s)` : ''}`
          : `${data.recomputed} / ${data.total} invoices updated${data.errors?.length ? ` — ${data.errors.length} error(s)` : ''}`,
        variant: 'success',
      });
    } catch {
      toast({ title: isFr ? 'Erreur réseau' : 'Network error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title={isFr ? 'Recalculer les allocations de paiement' : 'Recompute payment allocations'}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-ivory-200 hover:border-gold-300 text-gray-600 hover:text-gold-700 rounded-lg font-medium transition-colors disabled:opacity-50"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
      {isFr ? 'Recalculer' : 'Recompute'}
    </button>
  );
}
