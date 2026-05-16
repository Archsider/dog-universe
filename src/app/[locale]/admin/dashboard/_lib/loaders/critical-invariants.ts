import type { CriticalInvariantHit } from '../shapes';

export async function loadCriticalInvariants(): Promise<CriticalInvariantHit[]> {
  // Reads the Redis snapshots written by the hourly `invariants-check`
  // cron (see /admin/guardian/invariants). Surfaces ONLY the critical
  // severities with count > 0 — warnings ride the daily email digest.
  // Fail-open : Redis down → empty list, no banner shown.
  try {
    const { cacheGet } = await import('@/lib/cache');
    const knownKeys = [
      'overpaid',
      'negative_stock',
      'item_total_drift',
      'invoice_amount_drift',
      'allocated_sum_vs_paid',
      'payment_sum_vs_paid',
      'item_allocated_overflow',
      'fully_paid_missing_paidat',
      'mv_refresh_stale',
      'js_vs_mv_current_month',
    ] as const;
    const raws = await Promise.all(
      knownKeys.map((k) => cacheGet<{ count: number; label: string; severity: string } | null>(`invariant:last:${k}`)),
    );
    const hits: CriticalInvariantHit[] = [];
    raws.forEach((raw, i) => {
      if (!raw) return;
      let parsed: { count: number; label: string; severity: string };
      try {
        parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {
        return;
      }
      if (parsed.severity === 'critical' && parsed.count > 0) {
        hits.push({ key: knownKeys[i], label: parsed.label, count: parsed.count });
      }
    });
    return hits;
  } catch {
    return [];
  }
}
