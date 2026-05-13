'use client';

// Slim orchestrator — see _lib/types.ts and _components/ for the extracted
// helpers and section components.
//
// File went from 640 LOC to ~290 by extracting:
//   - _lib/types.ts                       (types + formatters + assessHealth — 85L)
//   - _components/StatusBanner.tsx        (5-variant health banner — 110L)
//   - _components/KpiCard.tsx             (KPI strip card — 40L)
//   - _components/BackupsList.tsx         (card grid + skeleton + empty state — 150L)
//   - _components/RestoreDialogs.tsx      (confirm + result dialogs — 175L)
//
// What stays here: state management (5 useStates), API calls (fetchBackups,
// triggerBackup, downloadBackup, performRestore), and the JSX that wires
// the section components together.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Database,
  RefreshCw,
  Play,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  HardDrive,
  XCircle,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  type Backup,
  type Diagnostics,
  type RestoreSummary,
  assessHealth,
  fmtBytes,
  fmtRelative,
} from './_lib/types';
import { StatusBanner } from './_components/StatusBanner';
import { KpiCard } from './_components/KpiCard';
import { BackupsList } from './_components/BackupsList';
import { RestoreConfirmDialog, RestoreResultDialog } from './_components/RestoreDialogs';

export default function BackupsClient({ locale }: { locale: string }) {
  const isFr = locale !== 'en';
  const [backups, setBackups] = useState<Backup[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [downloadingDate, setDownloadingDate] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<Backup | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/backups', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setBackups(json.backups ?? []);
      setDiagnostics(json.diagnostics ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBackups();
  }, [fetchBackups]);

  const health = useMemo(() => assessHealth(diagnostics, backups), [diagnostics, backups]);

  const triggerBackup = async () => {
    setTriggering(true);
    try {
      const res = await fetch('/api/admin/backups/trigger', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        toast({
          title: isFr ? 'Échec sauvegarde' : 'Backup failed',
          description: json.error ?? 'Unknown error',
          variant: 'destructive',
        });
      } else {
        toast({
          title: isFr ? 'Sauvegarde réussie' : 'Backup successful',
          description: `${json.key} — ${fmtBytes(json.bytes)} · ${json.durationMs}ms`,
        });
        await fetchBackups();
      }
    } catch (err) {
      toast({
        title: isFr ? 'Erreur réseau' : 'Network error',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setTriggering(false);
    }
  };

  const downloadBackup = async (date: string) => {
    setDownloadingDate(date);
    try {
      const res = await fetch(`/api/admin/backups/download/${date}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        toast({
          title: isFr ? 'Erreur téléchargement' : 'Download error',
          description: json.error ?? `HTTP ${res.status}`,
          variant: 'destructive',
        });
        return;
      }
      const a = document.createElement('a');
      a.href = json.url;
      a.download = `dog-universe-backup-${date}.json.gz`;
      a.click();
    } catch (err) {
      toast({
        title: isFr ? 'Erreur réseau' : 'Network error',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setDownloadingDate(null);
    }
  };

  const performRestore = async (date: string, dryRun = false) => {
    setRestoring(date);
    try {
      const url = dryRun
        ? `/api/admin/backups/restore/${date}?dryRun=1`
        : `/api/admin/backups/restore/${date}`;
      const res = await fetch(url, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        toast({
          title: isFr ? 'Échec restauration' : 'Restore failed',
          description: json.error ?? `HTTP ${res.status}`,
          variant: 'destructive',
        });
        return;
      }
      if (dryRun) {
        const total = json.total ?? 0;
        toast({
          title: isFr ? 'Aperçu' : 'Preview',
          description: isFr
            ? `${total} ligne(s) seraient examinées (${Object.keys(json.preview ?? {}).length} table(s)).`
            : `${total} row(s) would be processed across ${Object.keys(json.preview ?? {}).length} table(s).`,
        });
        return;
      }
      setRestoreResult({
        date,
        totals: json.totals,
        results: json.results,
        errors: json.errors,
      });
    } catch (err) {
      toast({
        title: isFr ? 'Erreur réseau' : 'Network error',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setRestoring(null);
      setConfirmRestore(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-[#C4974A]/10 p-2.5">
            <Database className="h-6 w-6 text-[#C4974A]" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-charcoal">
              {isFr ? 'Sauvegardes' : 'Backups'}
            </h1>
            <p className="text-sm text-charcoal/60 mt-0.5">
              {isFr
                ? 'Dumps JSON compressés · rétention 30 jours · cron automatique 03h00 UTC'
                : 'Compressed JSON dumps · 30-day retention · automatic cron at 03:00 UTC'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchBackups()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-ivory-200 bg-white hover:bg-ivory-50 text-sm text-charcoal disabled:opacity-50 transition"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isFr ? 'Actualiser' : 'Refresh'}
          </button>
          <button
            onClick={() => void triggerBackup()}
            disabled={triggering || health === 'misconfigured'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C4974A] text-white hover:bg-[#A7803D] text-sm font-medium disabled:opacity-50 shadow-sm transition"
          >
            {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {isFr ? 'Sauvegarder maintenant' : 'Backup now'}
          </button>
        </div>
      </div>

      <StatusBanner
        diagnostics={diagnostics}
        backups={backups}
        health={health}
        isFr={isFr}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={CheckCircle2}
          label={isFr ? 'Dernière réussite' : 'Last success'}
          value={diagnostics?.lastSuccess ? fmtRelative(diagnostics.lastSuccess.at, isFr) : '—'}
          sub={diagnostics?.lastSuccess ? fmtBytes(diagnostics.lastSuccess.bytes) : undefined}
          tone={diagnostics?.lastSuccess ? 'success' : 'warn'}
        />
        <KpiCard
          icon={XCircle}
          label={isFr ? 'Dernière erreur' : 'Last error'}
          value={
            diagnostics?.lastError
              ? fmtRelative(diagnostics.lastError.at, isFr)
              : isFr
                ? 'aucune'
                : 'none'
          }
          sub={diagnostics?.lastError ? diagnostics.lastError.code : undefined}
          tone={diagnostics?.lastError ? 'error' : 'success'}
        />
        <KpiCard
          icon={HardDrive}
          label={isFr ? 'Dumps stockés' : 'Stored dumps'}
          value={`${backups.length}`}
          sub={isFr ? 'rétention 30 jours' : '30-day retention'}
        />
        <KpiCard
          icon={Database}
          label={isFr ? 'Bucket' : 'Bucket'}
          value={diagnostics?.bucket ?? '—'}
          sub={
            diagnostics?.storageConfigured
              ? isFr
                ? 'configuré'
                : 'configured'
              : isFr
                ? 'manquant'
                : 'missing'
          }
          tone={diagnostics?.storageConfigured ? 'neutral' : 'error'}
        />
      </div>

      {/* Error state for fetch */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex gap-3 text-sm text-red-700">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <div>
            <strong>{isFr ? 'Erreur lors du chargement :' : 'Error loading:'}</strong>{' '}
            {error}
          </div>
        </div>
      )}

      {/* Backup list */}
      {!error && (
        <BackupsList
          isFr={isFr}
          loading={loading}
          backups={backups}
          health={health}
          downloadingDate={downloadingDate}
          restoring={restoring}
          onDownload={(d) => void downloadBackup(d)}
          onPreviewRestore={(d) => void performRestore(d, true)}
          onConfirmRestore={(b) => setConfirmRestore(b)}
        />
      )}

      <RestoreConfirmDialog
        isFr={isFr}
        target={confirmRestore}
        onCancel={() => setConfirmRestore(null)}
        onConfirm={() => confirmRestore && void performRestore(confirmRestore.date)}
      />

      <RestoreResultDialog
        isFr={isFr}
        result={restoreResult}
        onClose={() => setRestoreResult(null)}
      />
    </div>
  );
}
