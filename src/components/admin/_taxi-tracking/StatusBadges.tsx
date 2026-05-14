interface HealthBadgeProps {
  trackingActive: boolean;
  gpsHealth: 'live' | 'stale' | 'lost' | 'idle';
  isFr: boolean;
}

/**
 * GPS health pill — shown only when tracking is active. Colour driven
 * by `gpsHealthFor(lastFix)` from the watchdog.
 */
export function HealthBadge({ trackingActive, gpsHealth, isFr }: HealthBadgeProps) {
  if (!trackingActive) return null;
  if (gpsHealth === 'live') {
    return (
      <div className="px-3 py-2 rounded-md bg-green-50 border border-green-300 text-green-900 text-xs font-medium flex items-center gap-2">
        <span>🟢</span>
        <span>{isFr ? 'GPS actif' : 'GPS live'}</span>
      </div>
    );
  }
  if (gpsHealth === 'stale') {
    return (
      <div className="px-3 py-2 rounded-md bg-yellow-50 border border-yellow-300 text-yellow-900 text-xs font-medium flex items-center gap-2">
        <span>🟡</span>
        <span>{isFr ? 'GPS en attente…' : 'GPS waiting…'}</span>
      </div>
    );
  }
  if (gpsHealth === 'lost') {
    return (
      <div className="px-3 py-2 rounded-md bg-red-50 border border-red-300 text-red-900 text-xs font-medium flex items-center gap-2">
        <span>🔴</span>
        <span>{isFr ? 'GPS perdu — reconnexion…' : 'GPS lost — reconnecting…'}</span>
      </div>
    );
  }
  return null;
}

interface QueueBadgesProps {
  pendingSize: number; // in-memory FIFO (network failed)
  queueSize: number;   // SW IndexedDB queue (offline buffer)
  isFr: boolean;
}

/**
 * Two distinct queue indicators stacked:
 *   - pendingSize: in-memory FIFO populated when fetch fails. Emptied
 *     by the watchdog drain loop.
 *   - queueSize: SW IndexedDB buffer reported by the driver SW. Emptied
 *     by the SW background sync.
 *
 * Both badges render only when their count > 0 so the UI stays clean
 * during normal (online) operation.
 */
export function QueueBadges({ pendingSize, queueSize, isFr }: QueueBadgesProps) {
  return (
    <>
      {pendingSize > 0 && (
        <div className="px-3 py-2 rounded-md bg-orange-50 border border-orange-300 text-orange-900 text-xs font-medium flex items-center gap-2">
          <span className="animate-pulse">📡</span>
          <span>
            {isFr
              ? `${pendingSize} position${pendingSize > 1 ? 's' : ''} en file (réseau)`
              : `${pendingSize} position${pendingSize > 1 ? 's' : ''} queued (network)`}
          </span>
        </div>
      )}
      {queueSize > 0 && (
        <div className="px-3 py-2 rounded-md bg-yellow-50 border border-yellow-300 text-yellow-900 text-xs font-medium flex items-center gap-2">
          <span className="animate-pulse">🔄</span>
          <span>
            {isFr
              ? `${queueSize} position${queueSize > 1 ? 's' : ''} en attente de synchronisation`
              : `${queueSize} position${queueSize > 1 ? 's' : ''} pending sync`}
          </span>
        </div>
      )}
    </>
  );
}
