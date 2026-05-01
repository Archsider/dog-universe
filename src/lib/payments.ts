/**
 * Central payment allocation logic — Dog Universe
 *
 * allocatePayments(invoiceId) is the single source of truth for:
 *   - Recomputing paidAmount from Payment rows
 *   - Distributing that amount across InvoiceItems (Pension → Taxi → Others)
 *   - Deriving invoice.status
 *   - Triggering loyalty recalc + notifications on first transition to PAID
 *
 * Must be called (inside or after a transaction) after every Payment
 * creation or deletion.
 */

import { prisma } from '@/lib/prisma';
import { formatMAD } from '@/lib/utils';
import { calculateSuggestedGrade } from '@/lib/loyalty';

// ---------------------------------------------------------------------------
// Item sort priority:
//   0 — Pet Taxi — Aller  (taxi + aller)
//   1 — Pension / Boarding
//   2 — Pet Taxi — Retour (taxi + retour)
//   3 — Others
// Preserves insertion order within each group.
// ---------------------------------------------------------------------------
export function getItemAllocationPriority(description: string): number {
  const d = description.toLowerCase();
  if (d.includes('taxi') && d.includes('aller')) return 0;
  if (
    d.includes('pension') ||
    d.includes('nuit') ||
    d.includes('séjour') ||
    d.includes('sejour') ||
    d.includes('boarding')
  ) return 1;
  if (d.includes('taxi') && d.includes('retour')) return 2;
  return 3;
}

// ---------------------------------------------------------------------------
// Pure allocation kernel — testable without DB
// ---------------------------------------------------------------------------
export interface AllocationItem {
  id: string;
  description: string;
  total: number;
}

export interface AllocationResult {
  id: string;
  allocatedAmount: number;
  status: 'PAID' | 'PARTIAL' | 'PENDING';
}

export function computeItemAllocation(
  items: AllocationItem[],
  totalPaid: number,
): AllocationResult[] {
  const sorted = [...items].sort(
    (a, b) => getItemAllocationPriority(a.description) - getItemAllocationPriority(b.description),
  );

  let remaining = totalPaid;
  return sorted.map(item => {
    let allocatedAmount: number;
    let status: 'PAID' | 'PARTIAL' | 'PENDING';

    if (remaining >= item.total) {
      allocatedAmount = item.total;
      status = 'PAID';
    } else if (remaining > 0) {
      allocatedAmount = remaining;
      status = 'PARTIAL';
    } else {
      allocatedAmount = 0;
      status = 'PENDING';
    }

    remaining = Math.max(0, remaining - allocatedAmount);
    return { id: item.id, allocatedAmount, status };
  });
}

export function deriveInvoiceStatus(
  paidAmount: number,
  totalAmount: number,
): 'PENDING' | 'PARTIALLY_PAID' | 'PAID' {
  if (paidAmount <= 0) return 'PENDING';
  if (paidAmount < totalAmount) return 'PARTIALLY_PAID';
  return 'PAID';
}

// ---------------------------------------------------------------------------
// allocatePayments
// ---------------------------------------------------------------------------
export async function allocatePayments(invoiceId: string): Promise<void> {
  // Side-effect intents collected during the transaction, executed after commit.
  type NotifyPaidIntent = { clientId: string; invoiceNumber: string; amount: number };
  type NotifyGradeIntent = { clientId: string; grade: string; language: string };

  let notifyPaid: NotifyPaidIntent | null = null;
  let notifyGrade: NotifyGradeIntent | null = null;

  await prisma.$transaction(async (tx) => {
    // Pessimistic lock: serialize concurrent allocatePayments calls for the same invoice
    await tx.$executeRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;

    // ── 1. Load invoice with items and payments ──────────────────────────
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: { orderBy: { id: 'asc' } },
        payments: { orderBy: { paymentDate: 'asc' } },
      },
    });

    if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

    // CANCELLED invoices are frozen — never touch their status or items.
    if (invoice.status === 'CANCELLED') return;

    const wasAlreadyPaid = invoice.status === 'PAID';

    // ── 2. Recompute paidAmount ──────────────────────────────────────────
    const paidAmount = invoice.payments.reduce((sum, p) => sum + p.amount, 0);

    // ── 3 & 4. Sort items and distribute payment across them ─────────────
    const allocations = computeItemAllocation(invoice.items, paidAmount);

    for (const { id, allocatedAmount, status: itemStatus } of allocations) {
      await tx.invoiceItem.update({
        where: { id },
        data: { allocatedAmount, status: itemStatus },
      });
    }

    // ── 5. Derive invoice status ─────────────────────────────────────────
    let newStatus: string = deriveInvoiceStatus(paidAmount, invoice.amount);
    let paidAt = invoice.paidAt;

    if (newStatus === 'PAID' && !paidAt) {
      paidAt = new Date();
    }

    // Bump version (optimistic lock) on every payment-driven update so any
    // concurrent admin edit reading a stale snapshot will fail with a 409.
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { paidAmount, status: newStatus, paidAt, version: { increment: 1 } },
    });

    // ── 6. First-time PAID transition: loyalty recalc ───────────────────
    if (newStatus === 'PAID' && !wasAlreadyPaid) {
      const client = await tx.user.findUnique({
        where: { id: invoice.clientId },
        select: { language: true, historicalStays: true, historicalSpendMAD: true, isWalkIn: true },
      });

      // Walk-in clients: skip loyalty recalc and notifications
      if (client && !client.isWalkIn) {
        // Aggregate across ALL paid invoices (including this one, now updated)
        const totalPaidAgg = await tx.invoice.aggregate({
          where: { clientId: invoice.clientId, status: 'PAID' },
          _sum: { amount: true },
        });
        const completedStays = await tx.booking.count({
          where: { clientId: invoice.clientId, status: 'COMPLETED' },
        });

        const totalStays = completedStays + (client.historicalStays ?? 0);
        const totalRevenue = (totalPaidAgg._sum.amount ?? 0) + (client.historicalSpendMAD ?? 0);

        const suggestedGrade = calculateSuggestedGrade(totalStays, totalRevenue);

        const currentGrade = await tx.loyaltyGrade.findUnique({
          where: { clientId: invoice.clientId },
        });

        if (currentGrade && !currentGrade.isOverride && currentGrade.grade !== suggestedGrade) {
          await tx.loyaltyGrade.update({
            where: { clientId: invoice.clientId },
            data: { grade: suggestedGrade },
          });
          notifyGrade = {
            clientId: invoice.clientId,
            grade: suggestedGrade,
            language: client.language || 'fr',
          };
        }

        // Collect notification intent (executed after commit)
        notifyPaid = {
          clientId: invoice.clientId,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount,
        };
      }
    }
  }, { isolationLevel: 'Serializable' }); // ── transaction committed ───────────────────────────────────────────

  // Post-commit: fire notifications (use global prisma client, safe after commit)
  // Note: explicit non-null assertions are safe because the variables are only
  // assigned inside the transaction callback and read here after it has settled.
  if (notifyGrade !== null) {
    const g = notifyGrade as NotifyGradeIntent;
    const { createLoyaltyUpdateNotification } = await import('@/lib/notifications');
    const { invalidateLoyaltyCache } = await import('@/lib/loyalty-server');
    await invalidateLoyaltyCache(g.clientId);
    await createLoyaltyUpdateNotification(
      g.clientId,
      g.grade as Parameters<typeof createLoyaltyUpdateNotification>[1],
      g.language
    );
  }

  if (notifyPaid !== null) {
    const p = notifyPaid as NotifyPaidIntent;
    const { createInvoicePaidNotification } = await import('@/lib/notifications');
    await createInvoicePaidNotification(
      p.clientId,
      p.invoiceNumber,
      formatMAD(p.amount)
    );
  }
}
