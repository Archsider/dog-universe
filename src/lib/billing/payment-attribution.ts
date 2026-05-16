// Pure TS twin of the PG function `compute_payment_by_category`.
//
// The PG function is the RUNTIME source of truth. This twin exists for :
//   1. Unit testing the prorata algorithm against hardcoded prod cases
//      (`business-regression.test.ts` §1 — Anas, Benjamin, Rita, ...)
//   2. Potential defensive cross-check : a future invariant could compute
//      a sample of months in TS via this twin and assert equality with the
//      PG function. NOT wired today — overkill before any drift signal.
//
// Update protocol : if the PG formula changes (see
// `prisma/migrations/20260517_revenue_mv_semantic_b/migration.sql`), this
// twin MUST be updated in the same PR. The hardcoded regression tests will
// catch any divergence at CI time.

export interface AttributionPayment {
  amount: number;
  paymentDate: Date;
}

export interface AttributionItem {
  category: string;
  allocatedAmount: number;
}

export interface AttributionInvoice {
  status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
  paidAmount: number;
  items: AttributionItem[];
  payments: AttributionPayment[];
}

/** Round to 2 decimals — matches PG `ROUND(x::numeric, 2)`. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Returns the per-category revenue produced by ONE invoice across all
 * its payments, bucketed by (year, month). Sémantique B (cash basis pure).
 *
 * - Each Payment is fully attributed to the Casa month of its paymentDate
 * - Within a payment, the amount is split across categories at the ratio
 *   of `InvoiceItem.allocatedAmount` per category vs total allocated
 * - CANCELLED with paidAmount == 0 → returns {} (excluded)
 * - CANCELLED with paidAmount > 0  → kept (revenu acquis)
 *
 * Output shape : `{ "YYYY-MM": { categoryLower: amount } }`.
 */
export function attributePaymentsToCategoryMonth(
  invoice: AttributionInvoice,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  if (invoice.status === 'CANCELLED' && invoice.paidAmount === 0) return out;

  const totalAlloc = invoice.items.reduce((s, it) => s + it.allocatedAmount, 0);
  if (totalAlloc <= 0) return out;

  // Pre-compute per-category alloc share.
  const catAlloc: Record<string, number> = {};
  for (const it of invoice.items) {
    const key = it.category.toLowerCase();
    catAlloc[key] = (catAlloc[key] ?? 0) + it.allocatedAmount;
  }

  for (const p of invoice.payments) {
    const ymKey = casaYearMonthKey(p.paymentDate);
    if (!out[ymKey]) out[ymKey] = {};
    for (const [cat, alloc] of Object.entries(catAlloc)) {
      const share = round2((p.amount * alloc) / totalAlloc);
      out[ymKey][cat] = round2((out[ymKey][cat] ?? 0) + share);
    }
  }
  return out;
}

/**
 * Returns "YYYY-MM" anchored to Africa/Casablanca (UTC+1 fixed, no DST).
 * Same projection as the PG `AT TIME ZONE 'Africa/Casablanca'` cast.
 */
export function casaYearMonthKey(d: Date): string {
  const casaMs = d.getTime() + 60 * 60 * 1000; // +1h fixed
  const casa = new Date(casaMs);
  const y = casa.getUTCFullYear();
  const m = casa.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Sums per-category amounts across multiple invoices for a target month.
 * Convenience wrapper used by tests + by the (future) TS-vs-PG cross-check.
 */
export function sumAttributionsForMonth(
  invoices: AttributionInvoice[],
  yearMonthKey: string,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const inv of invoices) {
    const buckets = attributePaymentsToCategoryMonth(inv);
    const month = buckets[yearMonthKey];
    if (!month) continue;
    for (const [cat, amount] of Object.entries(month)) {
      totals[cat] = round2((totals[cat] ?? 0) + amount);
    }
  }
  return totals;
}
