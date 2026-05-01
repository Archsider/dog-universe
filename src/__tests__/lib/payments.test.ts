/**
 * Unit tests — src/lib/payments.ts
 *
 * Strategy: test the pure functions (computeItemAllocation, deriveInvoiceStatus,
 * getItemAllocationPriority) directly, and test allocatePayments by mocking prisma.
 *
 * allocatePayments uses prisma.$transaction — we mock it as
 *   vi.fn().mockImplementation((fn) => fn(mockTx))
 * so inner DB calls go to mockTx.* stubs.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const mockTx = {
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    invoice: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      aggregate: vi.fn(),
    },
    invoiceItem: {
      update: vi.fn().mockResolvedValue(undefined),
    },
    user: {
      findUnique: vi.fn(),
    },
    loyaltyGrade: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    },
    booking: {
      count: vi.fn(),
    },
  };

  return {
    prisma: {
      $transaction: vi.fn().mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
    },
    mockTx,
    createLoyaltyUpdateNotification: vi.fn().mockResolvedValue(undefined),
    createInvoicePaidNotification: vi.fn().mockResolvedValue(undefined),
    invalidateLoyaltyCache: vi.fn().mockResolvedValue(undefined),
    calculateSuggestedGrade: vi.fn().mockReturnValue('BRONZE'),
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/notifications', () => ({
  createLoyaltyUpdateNotification: mocks.createLoyaltyUpdateNotification,
  createInvoicePaidNotification: mocks.createInvoicePaidNotification,
}));
vi.mock('@/lib/loyalty-server', () => ({
  invalidateLoyaltyCache: mocks.invalidateLoyaltyCache,
}));
vi.mock('@/lib/loyalty', () => ({
  calculateSuggestedGrade: mocks.calculateSuggestedGrade,
}));

// Import AFTER mocks
import {
  computeItemAllocation,
  deriveInvoiceStatus,
  getItemAllocationPriority,
  allocatePayments,
  type AllocationItem,
} from '@/lib/payments';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeItem(id: string, description: string, total: number): AllocationItem {
  return { id, description, total };
}

const CANCELLED_INVOICE = {
  id: 'inv-cancelled',
  status: 'CANCELLED',
  clientId: 'client-1',
  amount: 500,
  invoiceNumber: 'INV-001',
  paidAt: null,
  items: [],
  payments: [],
};

const BASE_INVOICE = {
  id: 'inv-1',
  status: 'PENDING',
  clientId: 'client-1',
  amount: 600,
  invoiceNumber: 'INV-001',
  paidAt: null,
  items: [
    { id: 'item-1', description: 'Pension 3 nuits', total: 600, allocatedAmount: 0, status: 'PENDING' },
  ],
  payments: [{ id: 'pay-1', amount: 600, paymentDate: new Date() }],
};

beforeEach(() => {
  vi.clearAllMocks();
  // Reset $transaction to default pass-through
  mocks.prisma.$transaction.mockImplementation(
    (fn: (tx: typeof mocks.mockTx) => unknown) => fn(mocks.mockTx),
  );
});

// ===========================================================================
// getItemAllocationPriority
// ===========================================================================
describe('getItemAllocationPriority', () => {
  it('taxi aller gets priority 0', () => {
    expect(getItemAllocationPriority('Pet Taxi — Aller')).toBe(0);
  });
  it('boarding / pension gets priority 1', () => {
    expect(getItemAllocationPriority('Pension 3 nuits')).toBe(1);
    expect(getItemAllocationPriority('séjour complet')).toBe(1);
  });
  it('taxi retour gets priority 2', () => {
    expect(getItemAllocationPriority('Pet Taxi — Retour')).toBe(2);
  });
  it('unknown description gets priority 3', () => {
    expect(getItemAllocationPriority('Toilettage')).toBe(3);
  });
});

// ===========================================================================
// deriveInvoiceStatus
// ===========================================================================
describe('deriveInvoiceStatus', () => {
  it('returns PENDING when paidAmount is 0', () => {
    expect(deriveInvoiceStatus(0, 500)).toBe('PENDING');
  });
  it('returns PARTIALLY_PAID when paidAmount < totalAmount', () => {
    expect(deriveInvoiceStatus(200, 500)).toBe('PARTIALLY_PAID');
  });
  it('returns PAID when paidAmount equals totalAmount', () => {
    expect(deriveInvoiceStatus(500, 500)).toBe('PAID');
  });
  it('returns PAID when paidAmount exceeds totalAmount', () => {
    expect(deriveInvoiceStatus(600, 500)).toBe('PAID');
  });
});

// ===========================================================================
// computeItemAllocation — pure kernel
// ===========================================================================
describe('computeItemAllocation', () => {
  it('allocates a single payment to a single invoice fully', () => {
    const items = [makeItem('i1', 'Pension nuit', 300)];
    const results = computeItemAllocation(items, 300);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 'i1', allocatedAmount: 300, status: 'PAID' });
  });

  it('allocates across multiple items in priority order', () => {
    const items = [
      makeItem('i-boarding', 'Pension nuit', 300),
      makeItem('i-taxi-aller', 'Pet Taxi — Aller', 150),
    ];
    // Total 450, pay 450 — expect taxi-aller first (priority 0) then boarding (priority 1)
    const results = computeItemAllocation(items, 450);
    const taxiResult = results.find(r => r.id === 'i-taxi-aller');
    const boardingResult = results.find(r => r.id === 'i-boarding');
    expect(taxiResult).toMatchObject({ allocatedAmount: 150, status: 'PAID' });
    expect(boardingResult).toMatchObject({ allocatedAmount: 300, status: 'PAID' });
  });

  it('marks item PARTIALLY_PAID when payment covers only part of it', () => {
    const items = [makeItem('i1', 'Pension nuit', 300)];
    const results = computeItemAllocation(items, 100);
    expect(results[0]).toMatchObject({ id: 'i1', allocatedAmount: 100, status: 'PARTIAL' });
  });

  it('marks item PENDING when no payment remains for it', () => {
    const items = [
      makeItem('i-taxi', 'Pet Taxi — Aller', 150),
      makeItem('i-boarding', 'Pension nuit', 300),
    ];
    // Only 150 — covers taxi fully, nothing left for boarding
    const results = computeItemAllocation(items, 150);
    const boardingResult = results.find(r => r.id === 'i-boarding');
    expect(boardingResult).toMatchObject({ allocatedAmount: 0, status: 'PENDING' });
  });

  it('does not exceed item total on overpayment', () => {
    const items = [makeItem('i1', 'Pension nuit', 300)];
    const results = computeItemAllocation(items, 999);
    expect(results[0].allocatedAmount).toBe(300);
    expect(results[0].status).toBe('PAID');
  });

  it('returns empty array for empty items list', () => {
    expect(computeItemAllocation([], 500)).toEqual([]);
  });

  it('returns all PENDING items on zero-amount payment', () => {
    const items = [
      makeItem('i1', 'Pension nuit', 300),
      makeItem('i2', 'Toilettage', 100),
    ];
    const results = computeItemAllocation(items, 0);
    expect(results.every(r => r.status === 'PENDING' && r.allocatedAmount === 0)).toBe(true);
  });

  it('returns correct unallocated remainder implicitly via PENDING statuses', () => {
    // 3 items totalling 600; pay 250 → first item (150 taxi aller) PAID,
    // second item (300 boarding) gets remaining 100 → PARTIAL, third PENDING
    const items = [
      makeItem('taxi', 'Pet Taxi — Aller', 150),
      makeItem('board', 'Pension nuit', 300),
      makeItem('other', 'Toilettage', 100),
    ];
    const results = computeItemAllocation(items, 250);
    expect(results.find(r => r.id === 'taxi')).toMatchObject({ allocatedAmount: 150, status: 'PAID' });
    expect(results.find(r => r.id === 'board')).toMatchObject({ allocatedAmount: 100, status: 'PARTIAL' });
    expect(results.find(r => r.id === 'other')).toMatchObject({ allocatedAmount: 0, status: 'PENDING' });
  });
});

// ===========================================================================
// allocatePayments — DB integration (mocked)
// ===========================================================================
describe('allocatePayments', () => {
  it('skips CANCELLED invoices without touching items or status', async () => {
    mocks.mockTx.invoice.findUnique.mockResolvedValue(CANCELLED_INVOICE);
    await allocatePayments('inv-cancelled');
    expect(mocks.mockTx.invoiceItem.update).not.toHaveBeenCalled();
    expect(mocks.mockTx.invoice.update).not.toHaveBeenCalled();
  });

  it('throws when invoice is not found', async () => {
    mocks.mockTx.invoice.findUnique.mockResolvedValue(null);
    await expect(allocatePayments('inv-missing')).rejects.toThrow('Invoice inv-missing not found');
  });

  it('updates invoice to PAID when fully paid and fires post-commit notifications', async () => {
    mocks.mockTx.invoice.findUnique.mockResolvedValue(BASE_INVOICE);
    // client is not a walk-in → loyalty path
    mocks.mockTx.user.findUnique.mockResolvedValue({
      language: 'fr',
      historicalStays: 0,
      historicalSpendMAD: 0,
      isWalkIn: false,
    });
    mocks.mockTx.invoice.aggregate.mockResolvedValue({ _sum: { amount: 600 } });
    mocks.mockTx.booking.count.mockResolvedValue(1);
    mocks.mockTx.loyaltyGrade.findUnique.mockResolvedValue({
      clientId: 'client-1',
      grade: 'BRONZE',
      isOverride: false,
    });
    mocks.calculateSuggestedGrade.mockReturnValue('BRONZE'); // same grade → no grade change

    await allocatePayments('inv-1');

    expect(mocks.mockTx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-1' },
        data: expect.objectContaining({ status: 'PAID', paidAmount: 600 }),
      }),
    );
    // Invoice-paid notification fired post-commit
    expect(mocks.createInvoicePaidNotification).toHaveBeenCalledWith('client-1', 'INV-001', expect.any(String));
  });

  it('updates invoice to PARTIALLY_PAID on partial payment', async () => {
    const partialInvoice = {
      ...BASE_INVOICE,
      payments: [{ id: 'pay-1', amount: 200, paymentDate: new Date() }],
    };
    mocks.mockTx.invoice.findUnique.mockResolvedValue(partialInvoice);

    await allocatePayments('inv-1');

    expect(mocks.mockTx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PARTIALLY_PAID', paidAmount: 200 }),
      }),
    );
    // No paid notification on partial
    expect(mocks.createInvoicePaidNotification).not.toHaveBeenCalled();
  });

  it('skips loyalty recalc for walk-in clients', async () => {
    mocks.mockTx.invoice.findUnique.mockResolvedValue(BASE_INVOICE);
    mocks.mockTx.user.findUnique.mockResolvedValue({
      language: 'fr',
      historicalStays: 0,
      historicalSpendMAD: 0,
      isWalkIn: true, // walk-in
    });

    await allocatePayments('inv-1');

    // Loyalty aggregate should not be called for walk-ins
    expect(mocks.mockTx.invoice.aggregate).not.toHaveBeenCalled();
    expect(mocks.mockTx.loyaltyGrade.update).not.toHaveBeenCalled();
  });

  it('fires grade upgrade notification when grade changes on first PAID', async () => {
    mocks.mockTx.invoice.findUnique.mockResolvedValue(BASE_INVOICE);
    mocks.mockTx.user.findUnique.mockResolvedValue({
      language: 'fr',
      historicalStays: 3,
      historicalSpendMAD: 0,
      isWalkIn: false,
    });
    mocks.mockTx.invoice.aggregate.mockResolvedValue({ _sum: { amount: 600 } });
    mocks.mockTx.booking.count.mockResolvedValue(1);
    mocks.mockTx.loyaltyGrade.findUnique.mockResolvedValue({
      clientId: 'client-1',
      grade: 'BRONZE',
      isOverride: false,
    });
    mocks.calculateSuggestedGrade.mockReturnValue('SILVER'); // upgrade!

    await allocatePayments('inv-1');

    expect(mocks.mockTx.loyaltyGrade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { grade: 'SILVER' },
      }),
    );
    expect(mocks.invalidateLoyaltyCache).toHaveBeenCalledWith('client-1');
    expect(mocks.createLoyaltyUpdateNotification).toHaveBeenCalledWith('client-1', 'SILVER', 'fr');
  });

  it('does not fire grade upgrade when override is active', async () => {
    mocks.mockTx.invoice.findUnique.mockResolvedValue(BASE_INVOICE);
    mocks.mockTx.user.findUnique.mockResolvedValue({
      language: 'fr',
      historicalStays: 0,
      historicalSpendMAD: 0,
      isWalkIn: false,
    });
    mocks.mockTx.invoice.aggregate.mockResolvedValue({ _sum: { amount: 600 } });
    mocks.mockTx.booking.count.mockResolvedValue(1);
    mocks.mockTx.loyaltyGrade.findUnique.mockResolvedValue({
      clientId: 'client-1',
      grade: 'GOLD', // override-elevated grade
      isOverride: true, // locked by admin
    });
    mocks.calculateSuggestedGrade.mockReturnValue('SILVER');

    await allocatePayments('inv-1');

    expect(mocks.mockTx.loyaltyGrade.update).not.toHaveBeenCalled();
    expect(mocks.createLoyaltyUpdateNotification).not.toHaveBeenCalled();
  });
});
