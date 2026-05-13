'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Database,
  Download,
  RefreshCw,
  Play,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  HardDrive,
  UploadCloud,
  Eye,
  ShieldCheck,
  ShieldAlert,
  Clock,
  XCircle,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ─── Types (mirror the JSON returned by /api/admin/backups) ────────────────

interface Backup {
  date: string;
  key: string;
  bytes: number | null;
  createdAt: string | null;
}

interface Diagnostics {
  storageConfigured: boolean;
  bucket: string;
  count?: number;
  message?: string;
  listError?: string;
  lastSuccess: { at: string; key: string; bytes: number } | null;
  lastError: { at: string; code: string; error: string } | null;
}

interface RestoreSummary {
  date: string;
  totals: { inserted: number; skipped: number; failed: number };
  results: Record<string, { inserted: number; skipped: number; failed: number; errors: string[] }>;
  errors?: Record<string, string>;
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function fmtBytes(b: number | null): string {
  if (b === null) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDate(iso: string | null, isFr: boolean): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(isFr ? 'fr-MA' : 'en-GB');
}

function fmtRelative(iso: string | null, isFr: boolean): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return isFr ? 'à l\'instant' : 'just now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return isFr ? `il y a ${s} s` : `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return isFr ? `il y a ${m} min` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return isFr ? `il y a ${h} h` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return isFr ? `il y a ${d} j` : `${d}d ago`;
}

function daysOld(date: string): number {
  const d = new Date(date + 'T00:00:00Z').getTime();
  return Math.max(0, Math.floor((Date.now() - d) / (24 * 3600 * 1000)));
}

// ─── Status assessment ──────────────────────────────────────────────────────

type HealthStatus = 'healthy' | 'stale' | 'failing' | 'misconfigured' | 'unknown';

function assessHealth(d: Diagnostics | null, backups: Backup[]): HealthStatus {
  if (!d) return 'unknown';
  if (!d.storageConfigured) return 'misconfigured';
  if (d.lastError && (!d.lastSuccess || new Date(d.lastError.at) > new Date(d.lastSuccess.at))) {
    return 'failing';
  }
  if (backups.length === 0) return 'failing';
  const newest = backups[0];
  if (daysOld(newest.date) > 1) return 'stale';
  return 'healthy';
}

// ─── Main component ────────────────────────────────────────────────────────

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

  useEffect(() => { void fetchBackups(); }, [fetchBackups]);

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

  // ─── Render helpers ──────────────────────────────────────────────────────

  const StatusBanner = () => {
    if (!diagnostics) return null;
    const variants: Record<HealthStatus, { bg: string; border: string; icon: typeof ShieldCheck; iconColor: string; title: string; subtitle: string }> = {
      healthy: {
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        icon: ShieldCheck,
        iconColor: 'text-emerald-600',
        title: isFr ? 'Sauvegardes opérationnelles' : 'Backups healthy',
        subtitle: isFr
          ? `Dernière sauvegarde réussie ${fmtRelative(diagnostics.lastSuccess?.at ?? null, isFr)}.`
          : `Last successful backup ${fmtRelative(diagnostics.lastSuccess?.at ?? null, isFr)}.`,
      },
      stale: {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        icon: Clock,
        iconColor: 'text-amber-600',
        title: isFr ? 'Sauvegardes vieillissantes' : 'Backups stale',
        subtitle: isFr
          ? `La sauvegarde la plus récente date d'il y a ${daysOld(backups[0]?.date ?? '')} jours.`
          : `Newest backup is ${daysOld(backups[0]?.date ?? '')} day(s) old.`,
      },
      failing: {
        bg: 'bg-red-50',
        border: 'border-red-200',
        icon: ShieldAlert,
        iconColor: 'text-red-600',
        title: isFr ? 'Sauvegardes en échec' : 'Backups failing',
        subtitle: diagnostics.lastError
          ? `${diagnostics.lastError.code}: ${diagnostics.lastError.error}`
          : isFr ? 'Aucune sauvegarde réussie détectée.' : 'No successful backup detected.',
      },
      misconfigured: {
        bg: 'bg-red-50',
        border: 'border-red-200',
        icon: XCircle,
        iconColor: 'text-red-600',
        title: isFr ? 'Stockage non configuré' : 'Storage not configured',
        subtitle: diagnostics.message ?? '',
      },
      unknown: {
        bg: 'bg-ivory-50',
        border: 'border-ivory-200',
        icon: Database,
        iconColor: 'text-charcoal/40',
        title: isFr ? 'Diagnostics indisponibles' : 'Diagnostics unavailable',
        subtitle: '',
      },
    };
    const v = variants[health];
    const Icon = v.icon;
    return (
      <div className={`rounded-2xl border-2 ${v.border} ${v.bg} p-5 flex items-start gap-4 shadow-sm`}>
        <div className={`${v.iconColor} flex-shrink-0 mt-0.5`}>
          <Icon className="h-7 w-7" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-charcoal text-base">{v.title}</h2>
          {v.subtitle && <p className="text-sm text-charcoal/70 mt-1">{v.subtitle}</p>}
          {diagnostics.lastError && health !== 'misconfigured' && (
            <p className="text-xs text-red-700/80 mt-2 font-mono break-all">
              {isFr ? 'Dernière erreur :' : 'Last error:'} {fmtRelative(diagnostics.lastError.at, isFr)} — {diagnostics.lastError.error}
            </p>
          )}
        </div>
      </div>
    );
  };

  const KpiCard = ({ icon: Icon, label, value, sub, tone = 'neutral' }: { icon: typeof Database; label: string; value: string; sub?: string; tone?: 'neutral' | 'success' | 'warn' | 'error' }) => {
    const toneClasses = {
      neutral: 'text-charcoal/70',
      success: 'text-emerald-700',
      warn: 'text-amber-700',
      error: 'text-red-700',
    }[tone];
    return (
      <div className="rounded-xl border border-ivory-200 bg-white p-4 flex items-start gap-3">
        <div className={`${toneClasses} flex-shrink-0 mt-0.5`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide text-charcoal/50 font-medium">{label}</p>
          <p className="text-lg font-semibold text-charcoal tabular-nums mt-0.5 truncate">{value}</p>
          {sub && <p className="text-xs text-charcoal/50 mt-0.5">{sub}</p>}
        </div>
      </div>
    );
  };

  // ─── Render ──────────────────────────────────────────────────────────────

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
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
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

      <StatusBanner />

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
          value={diagnostics?.lastError ? fmtRelative(diagnostics.lastError.at, isFr) : (isFr ? 'aucune' : 'none')}
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
          sub={diagnostics?.storageConfigured ? (isFr ? 'configuré' : 'configured') : (isFr ? 'manquant' : 'missing')}
          tone={diagnostics?.storageConfigured ? 'neutral' : 'error'}
        />
      </div>

      {/* Error state for fetch */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex gap-3 text-sm text-red-700">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <div>
            <strong>{isFr ? 'Erreur lors du chargement :' : 'Error loading:'}</strong>
            {' '}{error}
          </div>
        </div>
      )}

      {/* Backup list — card-based */}
      {!error && (
        <div className="space-y-3">
          {loading && backups.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-xl border border-ivory-200 bg-white p-4 animate-pulse">
                  <div className="h-5 w-24 bg-ivory-100 rounded mb-3" />
                  <div className="h-4 w-32 bg-ivory-100 rounded mb-2" />
                  <div className="h-4 w-20 bg-ivory-100 rounded" />
                </div>
              ))}
            </div>
          ) : backups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-ivory-300 bg-white p-12 text-center text-charcoal/60">
              <Database className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-charcoal">{isFr ? 'Aucune sauvegarde disponible.' : 'No backups available.'}</p>
              <p className="text-sm mt-2 max-w-md mx-auto">
                {health === 'misconfigured'
                  ? (isFr
                      ? 'Le stockage n\'est pas configuré. Vérifie les variables d\'env SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sur Vercel.'
                      : 'Storage is not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars on Vercel.')
                  : (isFr
                      ? 'La prochaine sauvegarde automatique tournera à 03h00 UTC. Ou clique sur « Sauvegarder maintenant ».'
                      : 'The next automatic backup will run at 03:00 UTC. Or click "Backup now".')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {backups.map((b, i) => {
                const isNewest = i === 0;
                const age = daysOld(b.date);
                const isDownloading = downloadingDate === b.date;
                const isRestoring = restoring === b.date;
                return (
                  <div
                    key={b.date}
                    className={`rounded-xl border bg-white p-4 transition hover:shadow-md ${
                      isNewest ? 'border-emerald-300 ring-1 ring-emerald-200/50' : 'border-ivory-200'
                    }`}
                  >
                    {/* Date pill + age */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-charcoal">{b.date}</span>
                        {isNewest && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 uppercase tracking-wide">
                            {isFr ? 'récent' : 'newest'}
                          </span>
                        )}
                      </div>
                      <span className={`text-xs ${age > 7 ? 'text-amber-700' : 'text-charcoal/50'}`}>
                        {isFr ? `${age} j` : `${age}d`}
                      </span>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-xs text-charcoal/60 mb-4">
                      <span className="inline-flex items-center gap-1">
                        <HardDrive className="h-3 w-3" />
                        {fmtBytes(b.bytes)}
                      </span>
                      <span className="inline-flex items-center gap-1" title={fmtDate(b.createdAt, isFr)}>
                        <Clock className="h-3 w-3" />
                        {fmtRelative(b.createdAt, isFr)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void downloadBackup(b.date)}
                        disabled={isDownloading}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-ivory-200 bg-white hover:bg-ivory-50 text-xs font-medium text-charcoal disabled:opacity-50 transition"
                      >
                        {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        {isFr ? 'Télécharger' : 'Download'}
                      </button>
                      <button
                        onClick={() => void performRestore(b.date, true)}
                        disabled={isRestoring}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-ivory-200 bg-white hover:bg-ivory-50 text-xs text-charcoal/70 disabled:opacity-50 transition"
                        title={isFr ? 'Aperçu sans écrire' : 'Preview without writing'}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmRestore(b)}
                        disabled={isRestoring}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-xs font-medium text-amber-800 disabled:opacity-50 transition"
                      >
                        {isRestoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
                        {isFr ? 'Restaurer' : 'Restore'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Restore confirmation modal */}
      <AlertDialog open={!!confirmRestore} onOpenChange={(o) => !o && setConfirmRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isFr ? `Restaurer la sauvegarde du ${confirmRestore?.date} ?` : `Restore backup from ${confirmRestore?.date}?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              {isFr ? (
                <>
                  Cette opération est <strong>additive</strong> : les enregistrements existants ne seront <strong>jamais écrasés</strong>. Seules les lignes manquantes seront réinsérées dans l&apos;ordre des dépendances FK.
                  <br /><br />
                  Si une ligne échoue, le système poursuit par insertion ligne-par-ligne et te rapporte le détail par table.
                </>
              ) : (
                <>
                  This is <strong>additive only</strong>: existing records will <strong>never be overwritten</strong>. Only missing rows will be re-inserted in FK dependency order.
                  <br /><br />
                  If a row fails, the system falls back to per-row inserts and surfaces a per-table breakdown.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isFr ? 'Annuler' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRestore && void performRestore(confirmRestore.date)}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {isFr ? 'Restaurer' : 'Restore'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore result modal */}
      <AlertDialog open={!!restoreResult} onOpenChange={(o) => !o && setRestoreResult(null)}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {restoreResult?.totals.failed === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              )}
              {isFr ? `Restauration ${restoreResult?.date}` : `Restore ${restoreResult?.date}`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm space-y-3">
                {restoreResult && (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-emerald-50 border border-emerald-200 py-2">
                        <p className="text-2xl font-semibold text-emerald-700 tabular-nums">{restoreResult.totals.inserted}</p>
                        <p className="text-xs text-emerald-700/80 mt-0.5">{isFr ? 'insérées' : 'inserted'}</p>
                      </div>
                      <div className="rounded-lg bg-ivory-50 border border-ivory-200 py-2">
                        <p className="text-2xl font-semibold text-charcoal/70 tabular-nums">{restoreResult.totals.skipped}</p>
                        <p className="text-xs text-charcoal/60 mt-0.5">{isFr ? 'existaient déjà' : 'already existed'}</p>
                      </div>
                      <div className="rounded-lg bg-red-50 border border-red-200 py-2">
                        <p className="text-2xl font-semibold text-red-700 tabular-nums">{restoreResult.totals.failed}</p>
                        <p className="text-xs text-red-700/80 mt-0.5">{isFr ? 'échecs' : 'failures'}</p>
                      </div>
                    </div>
                    <div className="border-t border-ivory-200 pt-3 max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="text-charcoal/50">
                          <tr>
                            <th className="text-left py-1">Table</th>
                            <th className="text-right py-1">+</th>
                            <th className="text-right py-1">=</th>
                            <th className="text-right py-1">!</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(restoreResult.results).map(([table, r]) => (
                            <tr key={table} className="border-t border-ivory-100">
                              <td className="py-1.5 font-mono text-charcoal">{table}</td>
                              <td className="py-1.5 text-right text-emerald-700 tabular-nums">{r.inserted}</td>
                              <td className="py-1.5 text-right text-charcoal/50 tabular-nums">{r.skipped}</td>
                              <td className={`py-1.5 text-right tabular-nums ${r.failed > 0 ? 'text-red-700 font-semibold' : 'text-charcoal/30'}`}>
                                {r.failed}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {restoreResult.errors && (
                      <details className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs">
                        <summary className="cursor-pointer font-medium text-red-800">
                          {isFr ? 'Détails des erreurs' : 'Error details'}
                        </summary>
                        <div className="mt-2 space-y-1 font-mono text-red-700">
                          {Object.entries(restoreResult.errors).map(([table, msg]) => (
                            <div key={table}>
                              <strong>{table}:</strong> {msg}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setRestoreResult(null)}>
              {isFr ? 'Fermer' : 'Close'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
