'use client';

// "Rafraîchir maintenant" button for /admin/guardian/invariants. Triggers
// POST /api/admin/guardian/refresh which re-runs all invariants and
// overwrites the Redis cache (so the page reload sees the fresh state).
//
// Use case : after a data fix or migration, the SUPERADMIN wants the
// dashboard to update immediately instead of waiting up to 1h for the
// hourly cron.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, CheckCircle2 } from 'lucide-react';

interface RefreshResult {
  ok: boolean;
  checkedAt: string;
  durationMs: number;
  totalChecks: number;
  violations: number;
  critical: number;
}

export function RefreshInvariantsButton({ isFr }: { isFr: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RefreshResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/guardian/refresh', { method: 'POST' });
      if (!res.ok) {
        setError(isFr ? 'Échec du rafraîchissement' : 'Refresh failed');
        return;
      }
      const data = (await res.json()) as RefreshResult;
      setResult(data);
      startTransition(() => router.refresh());
    } catch {
      setError(isFr ? 'Erreur réseau' : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  const loading = busy || pending;

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-[#C4974A] bg-white px-3 py-1.5 text-sm font-medium text-charcoal hover:bg-ivory-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        {loading
          ? isFr ? 'Vérification…' : 'Checking…'
          : isFr ? 'Rafraîchir maintenant' : 'Refresh now'}
      </button>
      {result && !error && (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
          <CheckCircle2 className="h-3 w-3" />
          {isFr
            ? `${result.totalChecks} vérifiés en ${result.durationMs}ms`
            : `${result.totalChecks} checked in ${result.durationMs}ms`}
        </span>
      )}
      {error && (
        <span className="text-xs text-red-600">{error}</span>
      )}
    </div>
  );
}
