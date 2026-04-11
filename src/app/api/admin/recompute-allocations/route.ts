import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
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
 */
export async function POST() {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const invoices = await prisma.invoice.findMany({
    where: { status: { not: 'CANCELLED' } },
    select: { id: true, invoiceNumber: true },
    orderBy: { issuedAt: 'asc' },
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
