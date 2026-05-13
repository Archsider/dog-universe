// Shared types + pure formatting helpers for the Backups admin page
// sub-components. Centralised here so each section file imports the
// same shapes without re-declaring them.

export interface Backup {
  date: string;
  key: string;
  bytes: number | null;
  createdAt: string | null;
}

export interface Diagnostics {
  storageConfigured: boolean;
  bucket: string;
  count?: number;
  message?: string;
  listError?: string;
  lastSuccess: { at: string; key: string; bytes: number } | null;
  lastError: { at: string; code: string; error: string } | null;
}

export interface RestoreSummary {
  date: string;
  totals: { inserted: number; skipped: number; failed: number };
  results: Record<
    string,
    { inserted: number; skipped: number; failed: number; errors: string[] }
  >;
  errors?: Record<string, string>;
}

export type HealthStatus = 'healthy' | 'stale' | 'failing' | 'misconfigured' | 'unknown';

// ─── Formatters ────────────────────────────────────────────────────────────

export function fmtBytes(b: number | null): string {
  if (b === null) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

export function fmtDate(iso: string | null, isFr: boolean): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(isFr ? 'fr-MA' : 'en-GB');
}

export function fmtRelative(iso: string | null, isFr: boolean): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return isFr ? "à l'instant" : 'just now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return isFr ? `il y a ${s} s` : `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return isFr ? `il y a ${m} min` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return isFr ? `il y a ${h} h` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return isFr ? `il y a ${d} j` : `${d}d ago`;
}

export function daysOld(date: string): number {
  const d = new Date(date + 'T00:00:00Z').getTime();
  return Math.max(0, Math.floor((Date.now() - d) / (24 * 3600 * 1000)));
}

// ─── Health assessment ─────────────────────────────────────────────────────

export function assessHealth(d: Diagnostics | null, backups: Backup[]): HealthStatus {
  if (!d) return 'unknown';
  if (!d.storageConfigured) return 'misconfigured';
  // Last error newer than last success → failing.
  if (
    d.lastError &&
    (!d.lastSuccess || new Date(d.lastError.at) > new Date(d.lastSuccess.at))
  ) {
    return 'failing';
  }
  if (backups.length === 0) return 'failing';
  const newest = backups[0];
  if (daysOld(newest.date) > 1) return 'stale';
  return 'healthy';
}
