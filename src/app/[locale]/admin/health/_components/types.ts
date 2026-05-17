export interface InvariantResult {
  key: string;
  label: string;
  count: number;
  sample: Array<Record<string, unknown>>;
  severity: 'critical' | 'warning';
}

export interface SmsRecent {
  phone: string;
  status: string;
  sentAt: string;
  bookingId: string | null;
}

export interface SmsStats {
  sent24h: number;
  pending24h: number;
  blockedToday: number;
  lastSentAt: string | null;
  recent: SmsRecent[];
}

export interface DbPoolStatus {
  pooled: boolean;
  via: 'port' | 'pgbouncer-flag' | 'unknown';
  warning: string | null;
}

export interface SlowQueryEntry {
  at: string;
  durationMs: number;
  sql: string;
}

export interface SlowQueryStats {
  count: number;
  newest: string;
  maxDurationMs: number;
  avgDurationMs: number;
}

export interface SlowQueriesPayload {
  thresholdMs: number;
  stats: SlowQueryStats | null;
  recent: SlowQueryEntry[];
}

export interface CronRun {
  name: string;
  lastRun: string | null;
}

export interface CronWithStatus extends CronRun {
  status: 'ok' | 'overdue' | 'never';
}

export interface Snapshot {
  invariants: InvariantResult[];
  cronRuns: CronRun[];
  dlqCount: number | null;
  smsStats: SmsStats | null;
  dbPool?: DbPoolStatus;
  slowQueries?: SlowQueriesPayload;
  sentry: { available: boolean; note: string };
  generatedAt: string;
}
