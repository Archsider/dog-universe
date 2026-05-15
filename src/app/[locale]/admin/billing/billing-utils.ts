import { currentMonthCasa } from '@/lib/dates-casablanca';

export const MONTH_NAMES_FR_LC = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export function getCurrentYYYYMM(): string {
  // Casa-anchored. `now.getMonth()` returns the runtime's local TZ value
  // (UTC on Vercel) which is the PREVIOUS Casa month between 23:00–00:00
  // UTC on the last day of the month. Use the Casa calendar string instead.
  const { year, month } = currentMonthCasa();
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function parseMonth(raw: string | undefined): string {
  if (!raw) return getCurrentYYYYMM();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  return getCurrentYYYYMM();
}

export function monthBounds(yyyyMm: string): { start: Date; end: Date } {
  const [y, m] = yyyyMm.split('-').map(Number);
  // Bornes en UTC pour stabilité serverless (Vercel runs en UTC, Maroc UTC+1).
  // Inclut tout YYYY-MM-01 00:00 → YYYY-MM-end 23:59:59.999 UTC.
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { start, end };
}

export type BuildQSFn = (overrides: Record<string, string | null | undefined>) => string;

export function makeBuildQS(
  selectedMonth: string,
  status: string,
  search: string,
  paymentMethod: string,
  category: string,
  sort: string,
  order: string,
  clientId: string,
): BuildQSFn {
  return (overrides) => {
    const base: Record<string, string> = { month: selectedMonth };
    if (status) base.status = status;
    if (search) base.search = search;
    if (paymentMethod) base.paymentMethod = paymentMethod;
    if (category) base.category = category;
    if (sort) base.sort = sort;
    if (order && order !== 'desc') base.order = order;
    if (clientId) base.clientId = clientId;
    const merged = { ...base, ...overrides };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v === '' || v === null || v === undefined) continue;
      params.set(k, v);
    }
    const qs = params.toString();
    return qs ? '?' + qs : '';
  };
}
