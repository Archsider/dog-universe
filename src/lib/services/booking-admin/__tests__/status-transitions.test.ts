/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  bookingUpdate: vi.fn(),
  invoiceFindUnique: vi.fn(),
  invoiceUpdate: vi.fn(),
  productFindUnique: vi.fn(),
  productUpdate: vi.fn(),
  logAction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => {
  const txStub = {
    invoice: { update: (a: any) => mocks.invoiceUpdate(a) },
    product: {
      findUnique: (a: any) => mocks.productFindUnique(a),
      update: (a: any) => mocks.productUpdate(a),
    },
  };
  return {
    prisma: {
      booking: { update: (a: any) => mocks.bookingUpdate(a) },
      invoice: { findUnique: (a: any) => mocks.invoiceFindUnique(a) },
      $transaction: async (cb: any) => (typeof cb === 'function' ? cb(txStub) : cb),
    },
  };
});

vi.mock('@/lib/log', () => ({
  logAction: (a: any) => mocks.logAction(a),
  LOG_ACTIONS: {
    INVOICE_CANCELLED_BY_NO_SHOW: 'INVOICE_CANCELLED_BY_NO_SHOW',
    PRODUCT_STOCK_RESTORED: 'PRODUCT_STOCK_RESTORED',
  },
}));
vi.mock('@sentry/nextjs', () => ({
  startSpan: vi.fn((_attrs: any, fn: any) => fn()),
}));
vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/observability', () => ({
  withSpan: vi.fn((_n: any, _a: any, fn: any) => fn()),
}));

import { applyStatusUpdate, handleNoShowInvoice } from '../status-transitions';

beforeEach(() => {
  vi.resetAllMocks();
});

// =============================================================================
// applyStatusUpdate — pure prisma.booking.update wrapper
// =============================================================================
describe('applyStatusUpdate', () => {
  it('forwards status + version increment to prisma.booking.update', async () => {
    mocks.bookingUpdate.mockResolvedValue({ id: 'b1', status: 'CONFIRMED', version: 2 });

    await applyStatusUpdate({ bookingId: 'b1', status: 'CONFIRMED' as any });

    expect(mocks.bookingUpdate).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'CONFIRMED', version: { increment: 1 } },
    });
  });

  it('passes through cancellationReason and notes when supplied', async () => {
    mocks.bookingUpdate.mockResolvedValue({ id: 'b1', status: 'CANCELLED' });

    await applyStatusUpdate({
      bookingId: 'b1',
      status: 'CANCELLED' as any,
      notes: 'admin note',
      cancellationReason: 'client a annulé par téléphone (>10 chars)',
    });

    expect(mocks.bookingUpdate).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: {
        status: 'CANCELLED',
        notes: 'admin note',
        cancellationReason: 'client a annulé par téléphone (>10 chars)',
        version: { increment: 1 },
      },
    });
  });

  it('omits status field when caller skips it (notes-only edit)', async () => {
    mocks.bookingUpdate.mockResolvedValue({ id: 'b1' });

    await applyStatusUpdate({ bookingId: 'b1', notes: 'admin saw the client' });

    const callArgs = mocks.bookingUpdate.mock.calls[0][0];
    expect(callArgs.data).not.toHaveProperty('status');
    expect(callArgs.data.notes).toBe('admin saw the client');
    expect(callArgs.data.version).toEqual({ increment: 1 });
  });

  it('always bumps version on every update (optimistic-lock invariant)', async () => {
    mocks.bookingUpdate.mockResolvedValue({ id: 'b1' });

    await applyStatusUpdate({ bookingId: 'b1' });
    await applyStatusUpdate({ bookingId: 'b1', notes: 'x' });
    await applyStatusUpdate({ bookingId: 'b1', status: 'COMPLETED' as any });

    for (const call of mocks.bookingUpdate.mock.calls) {
      expect(call[0].data.version).toEqual({ increment: 1 });
    }
  });
});

// =============================================================================
// handleNoShowInvoice — NO_SHOW invoice cancellation + stock restoration
// =============================================================================
describe('handleNoShowInvoice', () => {
  it('no-op when previousStatus is already NO_SHOW (idempotency)', async () => {
    await handleNoShowInvoice({
      bookingId: 'b1',
      actorId: 'admin-1',
      previousStatus: 'NO_SHOW',
    });
    expect(mocks.invoiceFindUnique).not.toHaveBeenCalled();
    expect(mocks.invoiceUpdate).not.toHaveBeenCalled();
    expect(mocks.productUpdate).not.toHaveBeenCalled();
  });

  it('no-op when the booking has no invoice', async () => {
    mocks.invoiceFindUnique.mockResolvedValue(null);

    await handleNoShowInvoice({
      bookingId: 'b1',
      actorId: 'admin-1',
      previousStatus: 'IN_PROGRESS',
    });

    // findUnique is called with bookingId — the select shape (items
    // with productId not null) is internal detail we don't pin to avoid
    // brittle tests if the select evolves.
    expect(mocks.invoiceFindUnique).toHaveBeenCalledTimes(1);
    expect(mocks.invoiceFindUnique.mock.calls[0][0].where).toEqual({ bookingId: 'b1' });
    expect(mocks.invoiceUpdate).not.toHaveBeenCalled();
    expect(mocks.productUpdate).not.toHaveBeenCalled();
  });

  it('skips when invoice is already CANCELLED (idempotent)', async () => {
    mocks.invoiceFindUnique.mockResolvedValue({
      id: 'inv1',
      status: 'CANCELLED',
      paidAmount: 0,
      items: [],
    });

    await handleNoShowInvoice({
      bookingId: 'b1',
      actorId: 'admin-1',
      previousStatus: 'CONFIRMED',
    });

    expect(mocks.invoiceUpdate).not.toHaveBeenCalled();
    expect(mocks.productUpdate).not.toHaveBeenCalled();
  });

  it('PAID invoice: keeps invoice (audit log) and restocks PRODUCT items', async () => {
    // No-show after the client paid — admin keeps the cash but restocks
    // any products that were already deducted from inventory.
    mocks.invoiceFindUnique.mockResolvedValue({
      id: 'inv1',
      status: 'PAID',
      paidAmount: 240,
      items: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 1 },
      ],
    });
    mocks.productFindUnique.mockResolvedValue({ available: true, stock: 10 });

    await handleNoShowInvoice({
      bookingId: 'b1',
      actorId: 'admin-1',
      previousStatus: 'IN_PROGRESS',
    });

    // Invoice NOT cancelled — paid revenue is kept on the books.
    expect(mocks.invoiceUpdate).not.toHaveBeenCalled();
    // Audit trail records the kept-PAID decision.
    expect(mocks.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'NO_SHOW_INVOICE_PAID_KEPT',
        entityId: 'inv1',
      }),
    );
    // Both products restocked.
    expect(mocks.productUpdate).toHaveBeenCalledTimes(2);
    const updatedIds = mocks.productUpdate.mock.calls.map((c: any) => c[0].where.id);
    expect(updatedIds).toEqual(expect.arrayContaining(['p1', 'p2']));
  });

  it('PENDING invoice: cancels invoice + restocks products in one transaction', async () => {
    mocks.invoiceFindUnique.mockResolvedValue({
      id: 'inv1',
      status: 'PENDING',
      paidAmount: 0,
      items: [{ productId: 'p1', quantity: 3 }],
    });
    mocks.productFindUnique.mockResolvedValue({ available: false, stock: 0 });

    await handleNoShowInvoice({
      bookingId: 'b1',
      actorId: 'admin-1',
      previousStatus: 'CONFIRMED',
    });

    // The non-paid path uses tx.invoice.update directly (service-level
    // path; not routed through the canonical cancelInvoice helper because
    // there's nothing to refund and the cascade is product-stock not
    // booking-item).
    expect(mocks.invoiceUpdate).toHaveBeenCalledWith({
      where: { id: 'inv1' },
      data: { status: 'CANCELLED' },
    });
    // Product restocked AND re-marked available (was unavailable + stock 0,
    // newStock = 3 > 0 → toggles available true).
    expect(mocks.productUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stock: { increment: 3 }, available: true },
    });
  });

  it('PARTIALLY_PAID invoice: same path as PAID (kept + restock)', async () => {
    mocks.invoiceFindUnique.mockResolvedValue({
      id: 'inv1',
      status: 'PARTIALLY_PAID',
      paidAmount: 100,
      items: [],
    });

    await handleNoShowInvoice({
      bookingId: 'b1',
      actorId: 'admin-1',
      previousStatus: 'CONFIRMED',
    });

    expect(mocks.invoiceUpdate).not.toHaveBeenCalled();
    expect(mocks.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'NO_SHOW_INVOICE_PAID_KEPT' }),
    );
  });
});
