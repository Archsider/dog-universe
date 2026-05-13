import {
  Database,
  Clock,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  type Backup,
  type Diagnostics,
  type HealthStatus,
  daysOld,
  fmtRelative,
} from '../_lib/types';

interface Props {
  diagnostics: Diagnostics | null;
  backups: Backup[];
  health: HealthStatus;
  isFr: boolean;
}

interface Variant {
  bg: string;
  border: string;
  icon: LucideIcon;
  iconColor: string;
  title: string;
  subtitle: string;
}

/**
 * Top-of-page status banner — five variants driven by `assessHealth()`.
 * Always renders the "last error" subline when present unless the bucket
 * itself is misconfigured (in which case the misconfigured message wins).
 */
export function StatusBanner({ diagnostics, backups, health, isFr }: Props) {
  if (!diagnostics) return null;

  const variants: Record<HealthStatus, Variant> = {
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
        : isFr
          ? 'Aucune sauvegarde réussie détectée.'
          : 'No successful backup detected.',
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
    <div
      className={`rounded-2xl border-2 ${v.border} ${v.bg} p-5 flex items-start gap-4 shadow-sm`}
    >
      <div className={`${v.iconColor} flex-shrink-0 mt-0.5`}>
        <Icon className="h-7 w-7" />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="font-semibold text-charcoal text-base">{v.title}</h2>
        {v.subtitle && <p className="text-sm text-charcoal/70 mt-1">{v.subtitle}</p>}
        {diagnostics.lastError && health !== 'misconfigured' && (
          <p className="text-xs text-red-700/80 mt-2 font-mono break-all">
            {isFr ? 'Dernière erreur :' : 'Last error:'}{' '}
            {fmtRelative(diagnostics.lastError.at, isFr)} —{' '}
            {diagnostics.lastError.error}
          </p>
        )}
      </div>
    </div>
  );
}
