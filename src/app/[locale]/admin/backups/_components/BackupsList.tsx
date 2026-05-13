import {
  Database,
  Download,
  Loader2,
  HardDrive,
  Eye,
  UploadCloud,
  Clock,
} from 'lucide-react';
import { type Backup, type HealthStatus, daysOld, fmtBytes, fmtDate, fmtRelative } from '../_lib/types';

interface Props {
  isFr: boolean;
  loading: boolean;
  backups: Backup[];
  health: HealthStatus;
  downloadingDate: string | null;
  restoring: string | null;
  onDownload: (date: string) => void;
  onPreviewRestore: (date: string) => void;
  onConfirmRestore: (b: Backup) => void;
}

/**
 * Card-grid list of available backups. Renders three states:
 *   - loading + empty → 6 skeleton cards
 *   - empty           → empty-state card with context-aware hint
 *   - present         → grid of card-per-backup
 *
 * The newest backup gets a green ring + "récent" pill so the operator
 * can see at a glance which one yesterday's cron produced.
 */
export function BackupsList({
  isFr,
  loading,
  backups,
  health,
  downloadingDate,
  restoring,
  onDownload,
  onPreviewRestore,
  onConfirmRestore,
}: Props) {
  if (loading && backups.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-ivory-200 bg-white p-4 animate-pulse"
          >
            <div className="h-5 w-24 bg-ivory-100 rounded mb-3" />
            <div className="h-4 w-32 bg-ivory-100 rounded mb-2" />
            <div className="h-4 w-20 bg-ivory-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (backups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ivory-300 bg-white p-12 text-center text-charcoal/60">
        <Database className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium text-charcoal">
          {isFr ? 'Aucune sauvegarde disponible.' : 'No backups available.'}
        </p>
        <p className="text-sm mt-2 max-w-md mx-auto">
          {health === 'misconfigured'
            ? isFr
              ? "Le stockage n'est pas configuré. Vérifie les variables d'env SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sur Vercel."
              : 'Storage is not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars on Vercel.'
            : isFr
              ? 'La prochaine sauvegarde automatique tournera à 03h00 UTC. Ou clique sur « Sauvegarder maintenant ».'
              : 'The next automatic backup will run at 03:00 UTC. Or click "Backup now".'}
        </p>
      </div>
    );
  }

  return (
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
              isNewest
                ? 'border-emerald-300 ring-1 ring-emerald-200/50'
                : 'border-ivory-200'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-charcoal">
                  {b.date}
                </span>
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

            <div className="flex items-center gap-4 text-xs text-charcoal/60 mb-4">
              <span className="inline-flex items-center gap-1">
                <HardDrive className="h-3 w-3" />
                {fmtBytes(b.bytes)}
              </span>
              <span
                className="inline-flex items-center gap-1"
                title={fmtDate(b.createdAt, isFr)}
              >
                <Clock className="h-3 w-3" />
                {fmtRelative(b.createdAt, isFr)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onDownload(b.date)}
                disabled={isDownloading}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-ivory-200 bg-white hover:bg-ivory-50 text-xs font-medium text-charcoal disabled:opacity-50 transition"
              >
                {isDownloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {isFr ? 'Télécharger' : 'Download'}
              </button>
              <button
                onClick={() => onPreviewRestore(b.date)}
                disabled={isRestoring}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-ivory-200 bg-white hover:bg-ivory-50 text-xs text-charcoal/70 disabled:opacity-50 transition"
                title={isFr ? 'Aperçu sans écrire' : 'Preview without writing'}
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onConfirmRestore(b)}
                disabled={isRestoring}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-xs font-medium text-amber-800 disabled:opacity-50 transition"
              >
                {isRestoring ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UploadCloud className="h-3.5 w-3.5" />
                )}
                {isFr ? 'Restaurer' : 'Restore'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
