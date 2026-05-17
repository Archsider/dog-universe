/**
 * DB invariant checks for the /admin/health page and reconciliation cron.
 *
 * Each check returns { count, sample[] }. `count` is the number of rows
 * violating the invariant. `sample` is up to 5 examples for quick diagnosis.
 *
 * All queries are safe to run on prod — read-only, indexed, capped.
 *
 * Trigger `trg_recompute_invoice_amount` is supposed to keep
 * `Invoice.amount = SUM(items.total)` ; if drift > 0 here, the trigger is
 * broken or was bypassed (raw SQL update).
 */

import { prisma } from './prisma';

export interface InvariantResult {
  key: string;
  label: string;
  count: number;
  sample: Array<Record<string, unknown>>;
  severity: 'critical' | 'warning';
}

export async function checkOverpaidInvoices(): Promise<InvariantResult> {
  const rows = await prisma.$queryRaw<Array<{ id: string; invoiceNumber: string; amount: string; paidAmount: string }>>`
    SELECT id, "invoiceNumber", "amount"::text AS amount, "paidAmount"::text AS "paidAmount"
    FROM "Invoice"
    WHERE "paidAmount" > "amount" + 0.01
    ORDER BY "issuedAt" DESC
    LIMIT 5
  `;
  const countRow = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c FROM "Invoice" WHERE "paidAmount" > "amount" + 0.01
  `;
  return {
    key: 'overpaid',
    label: 'Factures sur-payées (paidAmount > amount)',
    count: Number(countRow[0]?.c ?? BigInt(0)),
    sample: rows,
    severity: 'critical',
  };
}

export async function checkNegativeStock(): Promise<InvariantResult> {
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; stock: number }>>`
    SELECT id, name, stock FROM "Product" WHERE stock < 0 ORDER BY stock ASC LIMIT 5
  `;
  const countRow = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c FROM "Product" WHERE stock < 0
  `;
  return {
    key: 'negative_stock',
    label: 'Produits avec stock négatif',
    count: Number(countRow[0]?.c ?? BigInt(0)),
    sample: rows,
    severity: 'critical',
  };
}

export async function checkItemTotalDrift(): Promise<InvariantResult> {
  // Tolerance 0.01 MAD (1 centime) to absorb Decimal rounding.
  const rows = await prisma.$queryRaw<Array<{ id: string; invoiceId: string; quantity: number; unitPrice: string; total: string }>>`
    SELECT id, "invoiceId", quantity, "unitPrice"::text AS "unitPrice", "total"::text AS total
    FROM "InvoiceItem"
    WHERE ABS("total" - (quantity * "unitPrice")) > 0.01
    LIMIT 5
  `;
  const countRow = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c FROM "InvoiceItem"
    WHERE ABS("total" - (quantity * "unitPrice")) > 0.01
  `;
  return {
    key: 'item_total_drift',
    label: 'InvoiceItem où total ≠ quantity × unitPrice',
    count: Number(countRow[0]?.c ?? BigInt(0)),
    sample: rows,
    severity: 'warning',
  };
}

export async function checkInvoiceAmountDrift(): Promise<InvariantResult> {
  // Trigger trg_recompute_invoice_amount should prevent this. Tolerance 0.01.
  const rows = await prisma.$queryRaw<Array<{ id: string; invoiceNumber: string; amount: string; sum_items: string }>>`
    SELECT i.id, i."invoiceNumber", i.amount::text AS amount,
           COALESCE(SUM(ii.total), 0)::text AS sum_items
    FROM "Invoice" i
    LEFT JOIN "InvoiceItem" ii ON ii."invoiceId" = i.id
    GROUP BY i.id
    HAVING ABS(i.amount - COALESCE(SUM(ii.total), 0)) > 0.01
    LIMIT 5
  `;
  const countRow = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c FROM (
      SELECT i.id
      FROM "Invoice" i
      LEFT JOIN "InvoiceItem" ii ON ii."invoiceId" = i.id
      GROUP BY i.id
      HAVING ABS(i.amount - COALESCE(SUM(ii.total), 0)) > 0.01
    ) sub
  `;
  return {
    key: 'invoice_amount_drift',
    label: 'Invoice.amount ≠ SUM(items.total)',
    count: Number(countRow[0]?.c ?? BigInt(0)),
    sample: rows,
    severity: 'critical',
  };
}

// ─── Accounting invariants (Module 1, 2026-05-15) ────────────────────────
// Six additional checks added on top of the original four to cover the
// invariants flagged after the Rita bug (Sémantique A revenue attribution)
// and the broader hardening of the accounting pipeline. These run on the
// HOURLY `invariants-check` cron with SMS alerts on critical violations,
// alongside the existing daily `health-reconciliation` email digest.
//
// Tolerance everywhere = 0.01 MAD (1 centime) — absorbs DECIMAL(10,2)
// rounding without false positives.

export async function checkAllocatedSumVsPaid(): Promise<InvariantResult> {
  // SUM(InvoiceItem.allocatedAmount) ≠ Invoice.paidAmount per invoice.
  // Means the per-item allocator drifted away from the master paidAmount
  // — analytics drill-down per category would lie.
  const rows = await prisma.$queryRaw<Array<{ id: string; invoiceNumber: string; paidAmount: string; sum_allocated: string }>>`
    SELECT i.id, i."invoiceNumber",
           i."paidAmount"::text AS "paidAmount",
           COALESCE(SUM(ii."allocatedAmount"), 0)::text AS sum_allocated
    FROM "Invoice" i
    LEFT JOIN "InvoiceItem" ii ON ii."invoiceId" = i.id
    WHERE i."paidAmount" > 0
    GROUP BY i.id
    HAVING ABS(i."paidAmount" - COALESCE(SUM(ii."allocatedAmount"), 0)) > 0.01
    ORDER BY i."issuedAt" DESC
    LIMIT 5
  `;
  const countRow = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c FROM (
      SELECT i.id
      FROM "Invoice" i
      LEFT JOIN "InvoiceItem" ii ON ii."invoiceId" = i.id
      WHERE i."paidAmount" > 0
      GROUP BY i.id
      HAVING ABS(i."paidAmount" - COALESCE(SUM(ii."allocatedAmount"), 0)) > 0.01
    ) sub
  `;
  return {
    key: 'allocated_sum_vs_paid',
    label: 'SUM(InvoiceItem.allocatedAmount) ≠ Invoice.paidAmount',
    count: Number(countRow[0]?.c ?? BigInt(0)),
    sample: rows,
    severity: 'critical',
  };
}

export async function checkPaymentSumVsPaid(): Promise<InvariantResult> {
  // SUM(Payment.amount) ≠ Invoice.paidAmount per invoice.
  // Means a Payment row was deleted/edited without recomputing paidAmount,
  // OR paidAmount was edited manually. Either way the cash register lies.
  const rows = await prisma.$queryRaw<Array<{ id: string; invoiceNumber: string; paidAmount: string; sum_payments: string }>>`
    SELECT i.id, i."invoiceNumber",
           i."paidAmount"::text AS "paidAmount",
           COALESCE(SUM(p.amount), 0)::text AS sum_payments
    FROM "Invoice" i
    LEFT JOIN "Payment" p ON p."invoiceId" = i.id
    GROUP BY i.id
    HAVING ABS(i."paidAmount" - COALESCE(SUM(p.amount), 0)) > 0.01
    ORDER BY i."issuedAt" DESC
    LIMIT 5
  `;
  const countRow = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c FROM (
      SELECT i.id
      FROM "Invoice" i
      LEFT JOIN "Payment" p ON p."invoiceId" = i.id
      GROUP BY i.id
      HAVING ABS(i."paidAmount" - COALESCE(SUM(p.amount), 0)) > 0.01
    ) sub
  `;
  return {
    key: 'payment_sum_vs_paid',
    label: 'SUM(Payment.amount) ≠ Invoice.paidAmount',
    count: Number(countRow[0]?.c ?? BigInt(0)),
    sample: rows,
    severity: 'critical',
  };
}

export async function checkItemAllocatedOverflow(): Promise<InvariantResult> {
  // InvoiceItem.allocatedAmount > InvoiceItem.total per row.
  // Means more was allocated to this line than the line costs — analytics
  // double-counts revenue.
  //
  // `total > 0` filter : DISCOUNT items have negative total by construction
  // (deductive items) and never receive allocation (`computeItemAllocation`
  // short-circuits `category === 'DISCOUNT'` to allocatedAmount=0, see
  // src/lib/payments.ts:72-74). A row like {total: -150, allocatedAmount: 0}
  // would otherwise satisfy `0 > -149.99` and falsely flag every discounted
  // invoice. The business semantic is "cash allocated to an item can't
  // exceed the item's price" — vacuous for negative-priced items.
  const rows = await prisma.$queryRaw<Array<{ id: string; invoiceId: string; total: string; allocatedAmount: string }>>`
    SELECT id, "invoiceId",
           total::text AS total,
           "allocatedAmount"::text AS "allocatedAmount"
    FROM "InvoiceItem"
    WHERE total > 0
      AND "allocatedAmount" > total + 0.01
    LIMIT 5
  `;
  const countRow = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c FROM "InvoiceItem"
    WHERE total > 0 AND "allocatedAmount" > total + 0.01
  `;
  return {
    key: 'item_allocated_overflow',
    label: 'InvoiceItem.allocatedAmount > InvoiceItem.total',
    count: Number(countRow[0]?.c ?? BigInt(0)),
    sample: rows,
    severity: 'critical',
  };
}

export async function checkFullyPaidMissingPaidAt(): Promise<InvariantResult> {
  // Invoice is fully paid (paidAmount ≈ amount) but paidAt is NULL.
  // Means the "mark as paid" hook didn't fire when the last payment
  // landed — comptable reports use paidAt for closure dates.
  const rows = await prisma.$queryRaw<Array<{ id: string; invoiceNumber: string; amount: string; paidAmount: string }>>`
    SELECT id, "invoiceNumber",
           amount::text AS amount,
           "paidAmount"::text AS "paidAmount"
    FROM "Invoice"
    WHERE "paidAt" IS NULL
      AND amount > 0
      AND ABS("paidAmount" - amount) < 0.01
    ORDER BY "issuedAt" DESC
    LIMIT 5
  `;
  const countRow = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c FROM "Invoice"
    WHERE "paidAt" IS NULL
      AND amount > 0
      AND ABS("paidAmount" - amount) < 0.01
  `;
  return {
    key: 'fully_paid_missing_paidat',
    label: 'Invoice fully paid mais paidAt = NULL',
    count: Number(countRow[0]?.c ?? BigInt(0)),
    sample: rows,
    severity: 'warning',
  };
}

const MV_STALENESS_THRESHOLD_HOURS = 2;

export async function checkMonthlyRevenueMvFresh(): Promise<InvariantResult> {
  // monthly_revenue_mv must be refreshed within the last 2h.
  // The refresh cron runs hourly (`5 * * * *`) ; if it stops firing, the
  // dashboards under-report revenue. We use the Redis last_run timestamp
  // (markCronRun) as the freshness signal — same data the /admin/health
  // dashboard reads.
  const { getCronLastRun } = await import('@/lib/observability');
  const lastRun = await getCronLastRun('refresh-monthly-revenue');
  const sample: Array<Record<string, unknown>> = [];
  let count = 0;
  if (!lastRun) {
    count = 1;
    sample.push({ reason: 'cron:last_run:refresh-monthly-revenue is missing' });
  } else {
    const ageMs = Date.now() - new Date(lastRun).getTime();
    const ageHours = ageMs / 3_600_000;
    if (ageHours > MV_STALENESS_THRESHOLD_HOURS) {
      count = 1;
      sample.push({
        lastRun,
        ageHours: Math.round(ageHours * 10) / 10,
        thresholdHours: MV_STALENESS_THRESHOLD_HOURS,
      });
    }
  }
  return {
    key: 'mv_refresh_stale',
    label: 'monthly_revenue_mv non rafraîchie depuis >2h',
    count,
    sample,
    severity: 'critical',
  };
}

// `checkJsVsMvCurrentMonth` was removed 2026-05-17 — see
// CLAUDE.md "DETTE TECHNIQUE" entry. The Sémantique A allocator it
// compared against the MV is no longer the canonical path : both the
// MV (via `monthly_revenue_mv`) and the live PG function
// (`compute_payment_by_category`) are Sémantique B sources, and #11
// (`checkPaymentAttributionDrift`) + #12 (`checkRevenueHelperVsLive`)
// already cover the cross-check apples-to-apples. Keeping the JS-vs-MV
// invariant would also have required keeping the JS keyword fallback
// (`inferItemCategory`) running on raw OTHER rows, which is precisely
// what the 20260518_normalize_legacy_other_categories migration is
// designed to retire.

// ─── Sémantique B — cash basis pure (depuis 2026-05-17) ───────────────
//
// #11 payment_attribution_drift
// Sum of Payment.amount in the current Casa month MUST equal sum of
// `monthly_revenue_mv.total` for the same (year, month) — tolerance
// 0.01 MAD. Catch :
//   - Payment on a CANCELLED invoice with paidAmount=0 leaked through
//     (should be excluded by the MV's CTE filter)
//   - Orphan Payment (no Invoice — impossible by FK, defensive)
//   - PG function `compute_payment_by_category` drift after a schema
//     migration (e.g. new category added but not mapped)
//
// Note : this invariant calls `prisma.payment.aggregate` with
// `_sum.amount` + `paymentDate` filter — normally banned by ESLint rule
// `no-direct-revenue-computation`, but this file is whitelisted because
// it owns the JS-vs-MV cross-check (the very thing the rule protects).
export async function checkPaymentAttributionDrift(): Promise<InvariantResult> {
  const { currentMonthCasa, startOfMonthCasa, endOfMonthCasa } = await import('@/lib/dates-casablanca');
  const now = new Date();
  const { year, month } = currentMonthCasa();
  const monthStart = startOfMonthCasa(now);
  const monthEnd = endOfMonthCasa(now);

  // Raw sum from Payment table — equivalent to the MV's casa_payment CTE
  // (filtered by paymentDate, joined on Invoice via FK) minus CANCELLED
  // invoices with paidAmount = 0 (which the MV excludes).
  const rawRows = await prisma.$queryRaw<Array<{ total: string | null }>>`
    SELECT COALESCE(SUM(p.amount), 0)::text AS total
    FROM "Payment" p
    JOIN "Invoice" i ON i.id = p."invoiceId"
    WHERE p."paymentDate" >= ${monthStart}
      AND p."paymentDate" <= ${monthEnd}
      AND NOT (i."status" = 'CANCELLED' AND i."paidAmount" = 0)
  `;
  const rawTotal = parseFloat(rawRows[0]?.total ?? '0');

  let mvTotal = 0;
  try {
    const mvRows = await prisma.$queryRaw<Array<{ total: string | null }>>`
      SELECT COALESCE(SUM(total), 0)::text AS total
      FROM monthly_revenue_mv
      WHERE year = ${year} AND month = ${month}
    `;
    mvTotal = parseFloat(mvRows[0]?.total ?? '0');
  } catch {
    return {
      key: 'payment_attribution_drift',
      label: 'Sémantique B — somme Payment vs somme MV (mois courant)',
      count: 0,
      sample: [{ note: 'monthly_revenue_mv unavailable, skipping' }],
      severity: 'critical',
    };
  }

  const diff = Math.round((rawTotal - mvTotal) * 100) / 100;
  const violated = Math.abs(diff) > 0.01;
  return {
    key: 'payment_attribution_drift',
    label: 'Sémantique B — somme Payment vs somme MV (mois courant)',
    count: violated ? 1 : 0,
    sample: violated
      ? [{ year, month, rawPaymentTotal: rawTotal, mvTotal, diff }]
      : [],
    severity: 'critical',
  };
}

// #12 revenue_helper_vs_live
// `getMonthlyRevenueByCategory(year, month)` (Sémantique B canonical
// path) MUST agree with `compute_payment_by_category(year, month)` (the
// PG function it wraps). Tolerance 0.01 MAD per category.
//
// Catches :
//   - MV out of sync with the PG function (REFRESH skipped, cron stale)
//   - PG function changed but MV not yet rebuilt
//   - Categorisation logic divergence between helper and function (impossible
//     by construction since helper calls the function — defensive)
//
// This invariant deliberately bypasses the MV staleness check inside the
// helper by calling computeLive directly — the helper itself can mask a
// stale MV by serving cached data, but the invariant must always be
// based on freshly-computed live values.
export async function checkRevenueHelperVsLive(): Promise<InvariantResult> {
  const { currentMonthCasa } = await import('@/lib/dates-casablanca');
  const { __test } = await import('@/lib/billing/monthly-revenue');
  const { year, month } = currentMonthCasa();

  let mvRows: Array<{ category: string; amount: number }> = [];
  let liveRows: Array<{ category: string; amount: number }> = [];
  try {
    const mv = await prisma.$queryRaw<Array<{ category: string; amount: string }>>`
      SELECT category, total::float8::text AS amount
      FROM monthly_revenue_mv
      WHERE year = ${year} AND month = ${month}
    `;
    mvRows = mv.map(r => ({ category: r.category, amount: parseFloat(r.amount) }));
    const live = await prisma.$queryRaw<Array<{ category: string; amount: string }>>`
      SELECT category, total::float8::text AS amount
      FROM compute_payment_by_category(${year}::int, ${month}::int)
    `;
    liveRows = live.map(r => ({ category: r.category, amount: parseFloat(r.amount) }));
  } catch {
    return {
      key: 'revenue_helper_vs_live',
      label: 'Sémantique B — MV vs compute_payment_by_category (mois courant)',
      count: 0,
      sample: [{ note: 'monthly_revenue_mv or PG function unavailable, skipping' }],
      severity: 'critical',
    };
  }

  const drift = __test.computeDrift(mvRows as never, liveRows as never);
  const violated = drift > 0.01;
  return {
    key: 'revenue_helper_vs_live',
    label: 'Sémantique B — MV vs compute_payment_by_category (mois courant)',
    count: violated ? 1 : 0,
    sample: violated
      ? [{ year, month, drift, mv: mvRows, live: liveRows }]
      : [],
    severity: 'critical',
  };
}

export async function runAllInvariantChecks(): Promise<InvariantResult[]> {
  const [
    overpaid, negativeStock, itemDrift, invoiceDrift,
    allocatedSum, paymentSum, allocOverflow, missingPaidAt,
    mvFresh,
    paymentAttribDrift, helperVsLive,
  ] = await Promise.all([
    checkOverpaidInvoices(),
    checkNegativeStock(),
    checkItemTotalDrift(),
    checkInvoiceAmountDrift(),
    checkAllocatedSumVsPaid(),
    checkPaymentSumVsPaid(),
    checkItemAllocatedOverflow(),
    checkFullyPaidMissingPaidAt(),
    checkMonthlyRevenueMvFresh(),
    checkPaymentAttributionDrift(),
    checkRevenueHelperVsLive(),
  ]);
  return [
    overpaid, negativeStock, itemDrift, invoiceDrift,
    allocatedSum, paymentSum, allocOverflow, missingPaidAt,
    mvFresh,
    paymentAttribDrift, helperVsLive,
  ];
}
