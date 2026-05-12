'use client';

import { useCallback, useEffect, useState } from 'react';
import { Database, Download, RefreshCw, Play, AlertTriangle, CheckCircle2, Loader2, HardDrive, UploadCloud } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Backup {
  date: string;
  key: string;
  bytes: number | null;
  createdAt: string | null;
}

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

export default function BackupsClient({ locale }: { locale: string }) {
  const isFr = locale !== 'en';
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [downloadingDate, setDownloadingDate] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/backups', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setBackups(json.backups ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchBackups(); }, [fetchBackups]);

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
      } else if (json.skipped) {
        toast({
          title: isFr ? 'Sauvegarde déjà effectuée' : 'Backup already done',
          description: isFr ? 'La sauvegarde du jour existe déjà.' : "Today's backup already exists.",
        });
      } else {
        toast({
          title: isFr ? 'Sauvegarde réussie' : 'Backup successful',
          description: `${json.key} — ${fmtBytes(json.bytes)}`,
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
      // Open signed URL in a new tab — browser handles the download
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

  const restoreBackup = async (date: string) => {
    const confirmed = window.confirm(
      isFr
        ? `Restaurer la sauvegarde du ${date} ?\n\nCette opération est additive : les enregistrements existants ne seront pas écrasés. Seules les données manquantes seront réinsérées.`
        : `Restore backup from ${date}?\n\nThis is additive only: existing records will NOT be overwritten. Only missing data will be re-inserted.`
    );
    if (!confirmed) return;
    setRestoring(date);
    try {
      const res = await fetch(`/api/admin/backups/restore/${date}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        toast({
          title: isFr ? 'Échec restauration' : 'Restore failed',
          description: json.error ?? `HTTP ${res.status}`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: isFr ? 'Restauration terminée' : 'Restore complete',
          description: isFr
            ? `${json.totalRestored} enregistrement(s) restauré(s).${json.errors ? ' Certaines tables ont échoué.' : ''}`
            : `${json.totalRestored} record(s) restored.${json.errors ? ' Some tables failed.' : ''}`,
          variant: json.errors ? 'destructive' : 'default',
        });
      }
    } catch (err) {
      toast({
        title: isFr ? 'Erreur réseau' : 'Network error',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Database className="h-6 w-6 text-[#C4974A]" />
          <div>
            <h1 className="text-2xl font-semibold text-charcoal">
              {isFr ? 'Sauvegardes de la base de données' : 'Database Backups'}
            </h1>
            <p className="text-sm text-charcoal/60 mt-0.5">
              {isFr
                ? 'Sauvegardes JSON compressées — rétention 30 jours — exécution automatique 03h00 UTC.'
                : 'Compressed JSON dumps — 30-day retention — automatic run at 03:00 UTC.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchBackups()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-ivory-200 bg-white hover:bg-ivory-50 text-sm text-charcoal disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {isFr ? 'Actualiser' : 'Refresh'}
          </button>
          <button
            onClick={() => void triggerBackup()}
            disabled={triggering}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C4974A] text-white hover:bg-[#A7803D] text-sm font-medium disabled:opacity-50"
          >
            {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {isFr ? 'Sauvegarder maintenant' : 'Backup now'}
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex gap-3 text-sm text-blue-800">
        <HardDrive className="h-5 w-5 flex-shrink-0 mt-0.5 text-blue-600" />
        <div>
          {isFr ? (
            <>
              <strong>Tables sauvegardées :</strong> User, Pet, Booking, Invoice, InvoiceItem, Payment, Product, ClientContract (métadonnées uniquement — les PDF restent dans Supabase Storage).
              Les fichiers de sauvegarde sont stockés dans le bucket privé et expirent après 30 jours.
              Pour restaurer, téléchargez le dump et exécutez le script de restauration documenté dans <code className="px-1 rounded bg-blue-100">docs/BACKUP_RESTORE.md</code>.
            </>
          ) : (
            <>
              <strong>Tables backed up:</strong> User, Pet, Booking, Invoice, InvoiceItem, Payment, Product, ClientContract (metadata only — PDFs stay in Supabase Storage).
              Backup files are stored in the private bucket and expire after 30 days.
              To restore, download the dump and run the restore script documented in <code className="px-1 rounded bg-blue-100">docs/BACKUP_RESTORE.md</code>.
            </>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex gap-3 text-sm text-red-700">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <div>
            <strong>{isFr ? 'Erreur lors du chargement des sauvegardes :' : 'Error loading backups:'}</strong>
            {' '}{error}
            {error.includes('Storage not configured') && (
              <p className="mt-1 text-xs">{isFr ? 'Vérifiez les variables d\'env SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.' : 'Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.'}</p>
            )}
          </div>
        </div>
      )}

      {/* Backup list */}
      {!error && (
        <div className="rounded-xl border border-ivory-200 bg-white overflow-hidden">
          {loading && backups.length === 0 ? (
            <div className="p-10 text-center text-charcoal/60">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-[#C4974A]" />
              {isFr ? 'Chargement des sauvegardes…' : 'Loading backups…'}
            </div>
          ) : backups.length === 0 ? (
            <div className="p-10 text-center text-charcoal/60">
              <Database className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{isFr ? 'Aucune sauvegarde disponible.' : 'No backups available.'}</p>
              <p className="text-sm mt-1">
                {isFr
                  ? 'La première sauvegarde automatique sera créée à 03h00 UTC. Ou cliquez sur "Sauvegarder maintenant".'
                  : 'The first automatic backup will be created at 03:00 UTC. Or click "Backup now".'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-ivory-50 text-charcoal/70 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">{isFr ? 'Date' : 'Date'}</th>
                  <th className="px-4 py-3 text-left">{isFr ? 'Taille' : 'Size'}</th>
                  <th className="px-4 py-3 text-left">{isFr ? 'Créé le' : 'Created at'}</th>
                  <th className="px-4 py-3 text-left">{isFr ? 'Statut' : 'Status'}</th>
                  <th className="px-4 py-3 text-right">{isFr ? 'Actions' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b, i) => {
                  const isToday = b.date === new Date().toISOString().slice(0, 10);
                  const isDownloading = downloadingDate === b.date;
                  return (
                    <tr key={b.date} className={`border-t border-ivory-100 ${i === 0 ? 'bg-emerald-50/40' : ''}`}>
                      <td className="px-4 py-3 font-mono font-medium text-charcoal">
                        {b.date}
                        {isToday && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                            {isFr ? "aujourd'hui" : 'today'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-charcoal/70 tabular-nums">{fmtBytes(b.bytes)}</td>
                      <td className="px-4 py-3 text-charcoal/60 text-xs">{fmtDate(b.createdAt, isFr)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium">{isFr ? 'Disponible' : 'Available'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => void downloadBackup(b.date)}
                            disabled={isDownloading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ivory-200 bg-white hover:bg-ivory-50 text-xs text-charcoal disabled:opacity-50"
                          >
                            {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            {isFr ? 'Télécharger' : 'Download'}
                          </button>
                          <button
                            onClick={() => void restoreBackup(b.date)}
                            disabled={restoring === b.date}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-xs text-amber-800 disabled:opacity-50"
                            title={isFr ? 'Restaurer (additif, ne remplace pas les données existantes)' : 'Restore (additive, does not overwrite existing data)'}
                          >
                            {restoring === b.date ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
                            {isFr ? 'Restaurer' : 'Restore'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Retention note */}
      {backups.length > 0 && (
        <p className="text-xs text-charcoal/50 text-center">
          {isFr
            ? `${backups.length} sauvegarde${backups.length > 1 ? 's' : ''} — rétention 30 jours (suppression automatique des anciennes sauvegardes)`
            : `${backups.length} backup${backups.length > 1 ? 's' : ''} — 30-day retention (older backups are automatically deleted)`}
        </p>
      )}
    </div>
  );
}
