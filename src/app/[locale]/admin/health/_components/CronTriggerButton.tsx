'use client';

// "Lancer maintenant" — manual cron trigger button shown next to OVERDUE
// / NEVER crons.  Calls POST /api/admin/cron-trigger/<name> and refreshes
// the page on success so the operator sees the cron's lastRun update.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Loader2 } from 'lucide-react';

interface Props {
  name: string;
  isFr: boolean;
}

export function CronTriggerButton({ name, isFr }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function trigger() {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/cron-trigger/${encodeURIComponent(name)}`, {
        method: 'POST',
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = isFr
          ? `Échec : ${j.error ?? r.statusText}`
          : `Failed: ${j.error ?? r.statusText}`;
        try { window.dispatchEvent(new CustomEvent('toast', { detail: { kind: 'error', message: msg } })); } catch {}
        return;
      }
      router.refresh();
    } catch (e) {
      const msg = `Erreur : ${e instanceof Error ? e.message : String(e)}`;
      try { window.dispatchEvent(new CustomEvent('toast', { detail: { kind: 'error', message: msg } })); } catch {}
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void trigger()}
      disabled={busy}
      title={isFr
        ? 'Déclencher manuellement (utile si Vercel n\'a pas synchronisé la planification)'
        : 'Trigger manually (useful when Vercel hasn\'t synced the schedule yet)'}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-amber-700 hover:bg-amber-100 border border-amber-300 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
      {isFr ? 'Lancer' : 'Run'}
    </button>
  );
}
