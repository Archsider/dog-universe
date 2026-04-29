// Server component — reads the latest heartbeat timestamp from Redis at page
// render time. No real-time polling: refreshes only when the admin reloads.
// The cron-driven TAXI_HEARTBEAT_LOST notification is the actual safety net.
import { Activity, AlertTriangle } from 'lucide-react';
import { getLastHeartbeat } from '@/lib/taxi-heartbeat';

interface Props {
  bookingId: string;
  locale: string;
}

export default async function TaxiHeartbeatIndicator({ bookingId, locale }: Props) {
  const last = await getLastHeartbeat(bookingId);
  const isFr = locale === 'fr';

  if (last === null) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span className="font-medium">
          {isFr ? 'Aucun signal GPS depuis plus de 5 min' : 'No GPS signal for over 5 min'}
        </span>
      </div>
    );
  }

  const ageMs = Math.max(0, Date.now() - last);
  const ageMin = Math.floor(ageMs / 60_000);
  const ageSec = Math.floor((ageMs % 60_000) / 1000);
  const fresh = ageMs < 60_000;

  const ageLabel = ageMin > 0
    ? (isFr ? `il y a ${ageMin} min` : `${ageMin} min ago`)
    : (isFr ? `il y a ${ageSec} s` : `${ageSec}s ago`);

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
      fresh
        ? 'bg-green-50 border border-green-200 text-green-700'
        : 'bg-amber-50 border border-amber-200 text-amber-700'
    }`}>
      <Activity className={`h-4 w-4 flex-shrink-0 ${fresh ? 'text-green-500' : 'text-amber-500'}`} />
      <span className="font-medium">
        {isFr ? `Signal GPS — ${ageLabel}` : `GPS signal — ${ageLabel}`}
      </span>
    </div>
  );
}
