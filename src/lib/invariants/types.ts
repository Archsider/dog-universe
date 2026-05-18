// Common types for invariant checks. Each check returns this shape so the
// dashboard, the cron, and the SMS alert format can iterate uniformly.

export interface InvariantResult {
  key: string;
  label: string;
  count: number;
  sample: Array<Record<string, unknown>>;
  severity: 'critical' | 'warning';
}
