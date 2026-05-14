import type { ConnectionStatus, TrackResponse } from '../_lib/use-tracking-stream';

export interface ConnectionBadge {
  dot: string;
  label: string;
  emoji: string;
}

/**
 * Visual representation of the SSE/polling/offline connection state.
 * Shared by the header (full text) and the footer (dot + timestamp).
 */
export function getConnectionBadge(
  status: ConnectionStatus,
  isFr: boolean,
): ConnectionBadge {
  switch (status) {
    case 'live':
      return {
        dot: 'bg-green-500 animate-pulse',
        label: isFr ? 'En direct' : 'Live',
        emoji: '🟢',
      };
    case 'reconnecting':
      return {
        dot: 'bg-yellow-500 animate-pulse',
        label: isFr ? 'Reconnexion…' : 'Reconnecting…',
        emoji: '🟡',
      };
    case 'polling':
      return {
        dot: 'bg-blue-500',
        label: isFr ? 'Mise à jour 10s' : 'Updating every 10s',
        emoji: '🔵',
      };
    case 'offline':
      return {
        dot: 'bg-red-500',
        label: isFr ? 'Hors-ligne' : 'Offline',
        emoji: '🔴',
      };
  }
}

interface TrackHeaderProps {
  isFr: boolean;
  data: TrackResponse | null;
  badge: ConnectionBadge;
}

/**
 * Top header — brand, "live tracking" subtitle, connection status badge
 * (hidden on mobile to save horizontal space — the same dot also appears
 * in the footer), and the client first name + pet summary.
 *
 * The data shape is backwards-compat: we prefer the PII-reduced
 * `firstName` + `petSummary` (deployed 2026-05-11) but fall back to the
 * legacy `clientName` + `petNames` for any in-flight session.
 */
export function TrackHeader({ isFr, data, badge }: TrackHeaderProps) {
  const displayName = data?.firstName ?? data?.clientName;
  const petLabel = data?.petSummary ?? (data?.petNames ? `🐾 ${data.petNames}` : null);

  return (
    <header className="px-4 py-3 sm:px-6 sm:py-4 bg-white border-b border-[rgba(196,151,74,0.2)] shadow-sm">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-base sm:text-lg font-bold text-[#2A2520] leading-tight">
            Dog Universe
          </h1>
          <p className="text-[10px] sm:text-xs text-[#C4974A] uppercase tracking-wider font-semibold">
            {isFr ? 'Suivi en direct' : 'Live tracking'}
          </p>
        </div>
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-[#8A7E75]"
            title={badge.label}
          >
            <span className={`inline-block w-2 h-2 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>
          {displayName && (
            <div className="text-right min-w-0">
              <p className="text-xs sm:text-sm font-medium text-[#2A2520] truncate">
                {displayName}
              </p>
              {petLabel && (
                <p className="text-[10px] sm:text-xs text-[#8A7E75] truncate">{petLabel}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

interface TrackFooterProps {
  isFr: boolean;
  badge: ConnectionBadge;
  updatedAt: string;
  distanceKm: number | undefined;
  speedMs: number | null | undefined;
}

/**
 * Bottom footer — only shown when a fix exists. Shows last-update time,
 * remaining distance (if known), and current speed (m/s → km/h).
 */
export function TrackFooter({
  isFr,
  badge,
  updatedAt,
  distanceKm,
  speedMs,
}: TrackFooterProps) {
  return (
    <footer className="px-4 py-3 sm:px-6 sm:py-3 bg-white border-t border-[rgba(196,151,74,0.2)]">
      <div className="max-w-3xl mx-auto flex items-center justify-between text-xs text-[#8A7E75]">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${badge.dot}`} />
          {isFr ? 'Mise à jour' : 'Updated'} : {updatedAt}
        </span>
        <span className="flex items-center gap-3">
          {typeof distanceKm === 'number' && distanceKm > 0 && (
            <span className="font-medium text-[#C4974A]">
              {distanceKm >= 10
                ? `${distanceKm.toFixed(1)} km`
                : `${distanceKm.toFixed(2)} km`}
            </span>
          )}
          {typeof speedMs === 'number' && speedMs >= 0 && (
            <span>{Math.round(speedMs * 3.6)} km/h</span>
          )}
        </span>
      </div>
    </footer>
  );
}
