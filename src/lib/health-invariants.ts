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

export async function runAllInvariantChecks(): Promise<InvariantResult[]> {
  const [overpaid, negativeStock, itemDrift, invoiceDrift] = await Promise.all([
    checkOverpaidInvoices(),
    checkNegativeStock(),
    checkItemTotalDrift(),
    checkInvoiceAmountDrift(),
  ]);
  return [overpaid, negativeStock, itemDrift, invoiceDrift];
}
