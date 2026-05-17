import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { allocatePayments } from '@/lib/payments';

/**
 * POST /api/admin/recompute-allocations
 *
 * Loops over all non-CANCELLED invoices and calls allocatePayments() on each,
 * correcting any stale paidAmount / InvoiceItem.allocatedAmount values.
 * Safe to call at any time — already-PAID invoices will NOT re-trigger
 * loyalty/notification side-effects (allocatePayments skips those when
 * wasAlreadyPaid === true).
 *
 * Protected by SUPERADMIN role + optional RECOMPUTE_SECRET env var.
 */
export async function POST(req: NextRequest) {
  // Restricted to SUPERADMIN only — this is a bulk mutation on all invoices
  const guard = await requireRole(['SUPERADMIN']);
  if (guard.error) return guard.error;

  // Optional second factor: require RECOMPUTE_SECRET header when env var is set
  const secret = process.env.RECOMPUTE_SECRET;
  if (secret) {
    const provided = req.headers.get('x-recompute-secret');
    if (provided !== secret) {
      return NextResponse.json({ error: 'INVALID_SECRET' }, { status: 403 });
    }
  }

  // Cap at 200 per call to prevent OOM on large datasets.
  // For larger fleets, call repeatedly with a cursor (future improvement).
  const invoices = await prisma.invoice.findMany({
    where: { status: { not: 'CANCELLED' } },
    select: { id: true, invoiceNumber: true },
    orderBy: { issuedAt: 'asc' },
    take: 200,
  });

  const errors: { invoiceNumber: string; error: string }[] = [];

  for (const invoice of invoices) {
    try {
      await allocatePayments(invoice.id);
    } catch (err) {
      errors.push({
        invoiceNumber: invoice.invoiceNumber,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    recomputed: invoices.length - errors.length,
    total: invoices.length,
    errors,
  });
}
