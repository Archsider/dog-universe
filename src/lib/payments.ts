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
function getItemAllocationPriority(description: string): number {
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
// allocatePayments
// ---------------------------------------------------------------------------
export async function allocatePayments(invoiceId: string): Promise<void> {
  // Side-effect intents collected during the transaction, executed after commit.
  type NotifyPaidIntent = { clientId: string; invoiceNumber: string; amount: number };
  type NotifyGradeIntent = { clientId: string; grade: string; language: string };

  let notifyPaid: NotifyPaidIntent | null = null;
  let notifyGrade: NotifyGradeIntent | null = null;

  await prisma.$transaction(async (tx) => {
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

    // ── 3. Sort items by allocation priority ────────────────────────────
    const sortedItems = [...invoice.items].sort(
      (a, b) => getItemAllocationPriority(a.description) - getItemAllocationPriority(b.description)
    );

    // ── 4. Distribute payment across items ──────────────────────────────
    let remaining = paidAmount;

    for (const item of sortedItems) {
      let allocatedAmount: number;
      let itemStatus: string;

      if (remaining >= item.total) {
        allocatedAmount = item.total;
        itemStatus = 'PAID';
      } else if (remaining > 0) {
        allocatedAmount = remaining;
        itemStatus = 'PARTIAL';
      } else {
        allocatedAmount = 0;
        itemStatus = 'PENDING';
      }

      remaining = Math.max(0, remaining - allocatedAmount);

      await tx.invoiceItem.update({
        where: { id: item.id },
        data: { allocatedAmount, status: itemStatus },
      });
    }

    // ── 5. Derive invoice status ─────────────────────────────────────────
    let newStatus: string;
    let paidAt = invoice.paidAt;

    if (paidAmount <= 0) {
      newStatus = 'PENDING';
    } else if (paidAmount < invoice.amount) {
      newStatus = 'PARTIALLY_PAID';
    } else {
      newStatus = 'PAID';
      if (!paidAt) paidAt = new Date();
    }

    await tx.invoice.update({
      where: { id: invoiceId },
      data: { paidAmount, status: newStatus, paidAt },
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
  }); // ── transaction committed ───────────────────────────────────────────

  // Post-commit: fire notifications (use global prisma client, safe after commit)
  // Note: explicit non-null assertions are safe because the variables are only
  // assigned inside the transaction callback and read here after it has settled.
  if (notifyGrade !== null) {
    const g = notifyGrade as NotifyGradeIntent;
    const { createLoyaltyUpdateNotification } = await import('@/lib/notifications');
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
