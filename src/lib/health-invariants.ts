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
  const rows = await prisma.$queryRaw<Array<{ id: string; invoiceId: string; total: string; allocatedAmount: string }>>`
    SELECT id, "invoiceId",
           total::text AS total,
           "allocatedAmount"::text AS "allocatedAmount"
    FROM "InvoiceItem"
    WHERE "allocatedAmount" > total + 0.01
    LIMIT 5
  `;
  const countRow = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c FROM "InvoiceItem" WHERE "allocatedAmount" > total + 0.01
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

export async function checkJsVsMvCurrentMonth(): Promise<InvariantResult> {
  // The JS allocator (computeMonthlyRevenueByCategory under Sémantique A)
  // and the materialized view must agree for the current month. If they
  // diverge, one of the two paths has drifted — Rita-style bug.
  //
  // Implementation (Bug A, 2026-05-15) : mirror the MV's source CTE
  // exactly — exclude CANCELLED invoices, scope to those with ≥1 payment
  // in the current month, no booking-derived path. The JS gate inside
  // `computeMonthlyRevenueByCategory` (Sémantique A) does the rest.
  //
  // The previous implementation used `getMonthlyInvoicesWhere` (case 1
  // ∪ case 2 ∪ case 3) which is intended for the "Total Facturé" KPI
  // (includes booking-active invoices regardless of payment status).
  // That asymmetry — JS scoping by booking, MV scoping by Payment —
  // produced false-positive flags on CANCELLED full-paid invoices
  // (counted by MV, ignored by JS). Both sides now read the same Payment-
  // anchored source.
  const { computeMonthlyRevenueByCategory } = await import('@/lib/accounting');
  const { startOfMonthCasa, endOfMonthCasa } = await import('@/lib/dates-casablanca');

  const now = new Date();
  const monthStart = startOfMonthCasa(now);
  const monthEnd = endOfMonthCasa(now);
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth() + 1; // MV uses 1-12

  // JS path — mirror the MV's source data exactly (Payment-anchored,
  // non-CANCELLED). The Sémantique A gate inside the helper filters
  // out invoices that aren't fully paid OR whose last payment fell
  // outside the window — same logic the MV's `closed_invoices` CTE
  // applies in SQL.
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { not: 'CANCELLED' },
      payments: {
        some: { paymentDate: { gte: monthStart, lte: monthEnd } },
      },
    },
    select: {
      items: { select: { category: true, description: true, total: true }, orderBy: { id: 'asc' } },
      payments: { select: { amount: true, paymentDate: true } },
    },
    take: 2000,
  });
  const jsBreakdown = { boarding: 0, taxi: 0, grooming: 0, croquettes: 0, other: 0 };
  for (const inv of invoices) {
    const sub = computeMonthlyRevenueByCategory(inv.payments, inv.items, monthStart, monthEnd);
    jsBreakdown.boarding += sub.boarding;
    jsBreakdown.taxi += sub.taxi;
    jsBreakdown.grooming += sub.grooming;
    jsBreakdown.croquettes += sub.croquettes;
    jsBreakdown.other += sub.other;
  }

  // MV path
  let mvRows: Array<{ category: string; total: number | string }> = [];
  try {
    mvRows = await prisma.$queryRaw<Array<{ category: string; total: number | string }>>`
      SELECT category, total FROM monthly_revenue_mv
      WHERE year = ${year} AND month = ${month}
    `;
  } catch {
    // If the MV doesn't exist (fresh DB without migrations), skip the
    // check — return 0 violations rather than a noisy false positive.
    return {
      key: 'js_vs_mv_current_month',
      label: 'CA JS vs monthly_revenue_mv (mois courant)',
      count: 0,
      sample: [{ note: 'monthly_revenue_mv unavailable, skipping' }],
      severity: 'critical',
    };
  }
  const mvBreakdown = { boarding: 0, taxi: 0, grooming: 0, croquettes: 0, other: 0 };
  for (const row of mvRows) {
    const amount = typeof row.total === 'string' ? parseFloat(row.total) : Number(row.total);
    switch (row.category) {
      case 'BOARDING': mvBreakdown.boarding += amount; break;
      case 'PET_TAXI': mvBreakdown.taxi += amount; break;
      case 'GROOMING': mvBreakdown.grooming += amount; break;
      case 'PRODUCT': mvBreakdown.croquettes += amount; break;
      default: mvBreakdown.other += amount; break;
    }
  }

  // Compare per category. Any divergence > 0.01 MAD = 1 violation.
  const tolerance = 0.01;
  const diffs: Array<Record<string, unknown>> = [];
  for (const key of ['boarding', 'taxi', 'grooming', 'croquettes', 'other'] as const) {
    const js = jsBreakdown[key];
    const mv = mvBreakdown[key];
    if (Math.abs(js - mv) > tolerance) {
      diffs.push({ category: key, js, mv, diff: Math.round((js - mv) * 100) / 100 });
    }
  }
  return {
    key: 'js_vs_mv_current_month',
    label: 'CA JS vs monthly_revenue_mv (mois courant)',
    count: diffs.length,
    sample: diffs,
    severity: 'critical',
  };
}

export async function runAllInvariantChecks(): Promise<InvariantResult[]> {
  const [
    overpaid, negativeStock, itemDrift, invoiceDrift,
    allocatedSum, paymentSum, allocOverflow, missingPaidAt,
    mvFresh, jsVsMv,
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
    checkJsVsMvCurrentMonth(),
  ]);
  return [
    overpaid, negativeStock, itemDrift, invoiceDrift,
    allocatedSum, paymentSum, allocOverflow, missingPaidAt,
    mvFresh, jsVsMv,
  ];
}
