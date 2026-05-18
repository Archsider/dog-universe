// Invoice-level integrity invariants.
//
// All queries read-only, indexed, and capped at 5 sample rows. Tolerance is
// 0.01 MAD (1 centime) everywhere to absorb DECIMAL(10,2) rounding without
// flagging legitimate sub-cent drift.
//
// Trigger `trg_recompute_invoice_amount` is supposed to keep
// `Invoice.amount = SUM(items.total)`; if `checkInvoiceAmountDrift` ever
// flags rows, the trigger is broken or was bypassed via raw SQL update.

import { prisma } from '../prisma';
import type { InvariantResult } from './types';

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

export async function checkItemTotalDrift(): Promise<InvariantResult> {
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
  // `total > 0` filter: DISCOUNT items have negative total by construction
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
