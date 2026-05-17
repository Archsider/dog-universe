// Expected max age (ms) before a cron is considered overdue.
// We use 1.5× the scheduled interval as grace period.
export const CRON_MAX_AGE_MS: Record<string, number> = {
  reminders: 36 * 3_600_000,             // daily — 36h
  'birthday-notifications': 36 * 3_600_000,
  'contract-reminders': 9 * 24 * 3_600_000,  // weekly — 9d
  'overdue-invoices': 36 * 3_600_000,
  'review-requests': 36 * 3_600_000,
  'weekly-pet-report': 9 * 24 * 3_600_000,
  'dlq-watch': 36 * 3_600_000,
  'taxi-retention': 36 * 3_600_000,
  'db-backup': 36 * 3_600_000,
  'refresh-monthly-revenue': 3 * 3_600_000,  // hourly — 3h
  'refresh-revenue-mv': 36 * 3_600_000,
  'purge-anonymized': 40 * 24 * 3_600_000, // monthly — 40d
  'health-reconciliation': 36 * 3_600_000,
  heartbeat: 10 * 60_000,                 // every 5min — 10min
};

export function cronStatus(name: string, lastRun: string | null): 'ok' | 'overdue' | 'never' {
  if (!lastRun) return 'never';
  const maxAge = CRON_MAX_AGE_MS[name] ?? 36 * 3_600_000;
  const age = Date.now() - new Date(lastRun).getTime();
  return age > maxAge ? 'overdue' : 'ok';
}

export function relativeTime(iso: string | null, isFr: boolean): string {
  if (!iso) return isFr ? 'Jamais' : 'Never';
  const age = Date.now() - new Date(iso).getTime();
  const min = Math.floor(age / 60_000);
  const h = Math.floor(age / 3_600_000);
  const d = Math.floor(age / 86_400_000);
  if (min < 2) return isFr ? 'à l\'instant' : 'just now';
  if (h < 2) return isFr ? `il y a ${min} min` : `${min} min ago`;
  if (d < 2) return isFr ? `il y a ${h}h` : `${h}h ago`;
  return isFr ? `il y a ${d}j` : `${d}d ago`;
}
