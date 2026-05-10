/**
 * API tests — booking products mutations
 *
 * Cible :
 *   - POST /api/admin/bookings/[id]/products
 *   - DELETE /api/admin/bookings/[id]/remove-product/[itemId]
 *   - PATCH /api/admin/bookings/[id]/update-product/[itemId]
 *
 * Stratégie : mock Prisma + auth + helpers décimaux. Le `$transaction(fn)`
 * appelle `fn(tx)` où `tx` est un client mock identique au client root.
 * Les `$queryRaw` (locks FOR UPDATE) renvoient un tableau pré-injecté.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    invoiceItem: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    product: { update: vi.fn(), findUnique: vi.fn() },
    invoice: { update: vi.fn() },
  };
  return {
    auth: vi.fn(),
    prisma: {
      booking: { findFirst: vi.fn() },
      invoiceItem: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    },
    tx,
    resolveItemCategory: vi.fn((productId: string | null, fallback: string) =>
      productId ? 'PRODUCT' : fallback,
    ),
  };
});

vi.mock('../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/decimal', () => ({
  toNumber: (v: unknown) => {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return Number(v);
    if (typeof (v as { toNumber?: () => number }).toNumber === 'function') {
      return (v as { toNumber: () => number }).toNumber();
    }
    return Number(v);
  },
}));
vi.mock('@/lib/billing', () => ({
  resolveItemCategory: mocks.resolveItemCategory,
}));
vi.mock('@prisma/client', () => ({
  Prisma: { Decimal: class Decimal { value: number; constructor(v: number | string) { this.value = Number(v); } toNumber() { return this.value; } } },
}));

import { POST as AddProduct } from '@/app/api/admin/bookings/[id]/products/route';
import { DELETE as RemoveProduct } from '@/app/api/admin/bookings/[id]/remove-product/[itemId]/route';
import { PATCH as UpdateProduct } from '@/app/api/admin/bookings/[id]/update-product/[itemId]/route';

function jsonReq(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
});

// ===========================================================================
// POST /api/admin/bookings/[id]/products
// ===========================================================================
describe('POST /api/admin/bookings/[id]/products', () => {
  const ctx = (id = 'b1') => ({ params: Promise.resolve({ id }) });

  beforeEach(() => {
    mocks.prisma.booking.findFirst.mockResolvedValue({
      id: 'b1',
      invoice: { id: 'inv-1', status: 'PENDING', amount: 100, version: 1 },
    });
  });

  it('creates an InvoiceItem (category=PRODUCT) when stock is sufficient', async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      { id: 'p-1', stock: 5, available: true, price: 50, name: 'Croquette', brand: 'Royal', reference: 'R12' },
    ]);
    mocks.tx.invoiceItem.create.mockResolvedValueOnce({
      id: 'ii-1', description: 'Croquette · Royal · réf. R12', quantity: 2, unitPrice: 50, total: 100, category: 'PRODUCT',
    });

    const res = await AddProduct(
      jsonReq('http://x/api/admin/bookings/b1/products', 'POST', { productId: 'p-1', quantity: 2 }),
      ctx(),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.category).toBe('PRODUCT');
    expect(mocks.tx.invoiceItem.create).toHaveBeenCalled();
    expect(mocks.tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stock: { decrement: 2 } }) }),
    );
    // available should NOT be set false (stock-2=3 remaining)
    const productUpdateArgs = mocks.tx.product.update.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(productUpdateArgs.data).not.toHaveProperty('available');
  });

  it('sets available=false when stock decrements to 0', async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      { id: 'p-1', stock: 2, available: true, price: 50, name: 'Croquette', brand: null, reference: null },
    ]);
    mocks.tx.invoiceItem.create.mockResolvedValueOnce({ id: 'ii', description: 'x', quantity: 2, unitPrice: 50, total: 100, category: 'PRODUCT' });

    const res = await AddProduct(
      jsonReq('http://x/api/admin/bookings/b1/products', 'POST', { productId: 'p-1', quantity: 2 }),
      ctx(),
    );

    expect(res.status).toBe(200);
    const args = mocks.tx.product.update.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(args.data.available).toBe(false);
  });

  it('returns 400 OUT_OF_STOCK when quantity exceeds stock', async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      { id: 'p-1', stock: 1, available: true, price: 10, name: 'X', brand: null, reference: null },
    ]);
    const res = await AddProduct(
      jsonReq('http://x/api/admin/bookings/b1/products', 'POST', { productId: 'p-1', quantity: 5 }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('OUT_OF_STOCK');
    expect(mocks.tx.invoiceItem.create).not.toHaveBeenCalled();
  });

  it('returns 400 PRODUCT_UNAVAILABLE when product not available', async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      { id: 'p-1', stock: 10, available: false, price: 10, name: 'X', brand: null, reference: null },
    ]);
    const res = await AddProduct(
      jsonReq('http://x/api/admin/bookings/b1/products', 'POST', { productId: 'p-1', quantity: 1 }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('PRODUCT_UNAVAILABLE');
  });

  it('returns 400 NO_INVOICE when booking has no invoice', async () => {
    mocks.prisma.booking.findFirst.mockResolvedValueOnce({ id: 'b1', invoice: null });
    const res = await AddProduct(
      jsonReq('http://x/api/admin/bookings/b1/products', 'POST', { productId: 'p-1', quantity: 1 }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('NO_INVOICE');
  });

  it('forces category=PRODUCT via resolveItemCategory regardless of payload', async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([
      { id: 'p-1', stock: 5, available: true, price: 10, name: 'X', brand: null, reference: null },
    ]);
    mocks.tx.invoiceItem.create.mockResolvedValueOnce({ id: 'ii', description: 'X', quantity: 1, unitPrice: 10, total: 10, category: 'PRODUCT' });

    await AddProduct(
      jsonReq('http://x/api/admin/bookings/b1/products', 'POST', { productId: 'p-1', quantity: 1 }),
      ctx(),
    );

    expect(mocks.resolveItemCategory).toHaveBeenCalledWith('p-1', 'PRODUCT');
    const createArgs = mocks.tx.invoiceItem.create.mock.calls[0]![0] as { data: { category: string } };
    expect(createArgs.data.category).toBe('PRODUCT');
  });
});

// ===========================================================================
// DELETE /api/admin/bookings/[id]/remove-product/[itemId]
// ===========================================================================
describe('DELETE /api/admin/bookings/[id]/remove-product/[itemId]', () => {
  const ctx = (id = 'b1', itemId = 'ii-1') => ({ params: Promise.resolve({ id, itemId }) });

  beforeEach(() => {
    mocks.prisma.booking.findFirst.mockResolvedValue({ invoice: { id: 'inv-1' } });
    mocks.prisma.invoiceItem.findUnique.mockResolvedValue({
      id: 'ii-1', invoiceId: 'inv-1', category: 'PRODUCT',
      productId: 'p-1', quantity: 2, total: 100,
    });
    mocks.tx.product.findUnique.mockResolvedValue({ id: 'p-1', stock: 3, available: true });
  });

  it('restores stock and returns 204', async () => {
    const res = await RemoveProduct(new Request('http://x', { method: 'DELETE' }) as never, ctx());
    expect(res.status).toBe(204);
    expect(mocks.tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stock: { increment: 2 } }) }),
    );
  });

  it('reactivates available=true if stock was 0 and now > 0', async () => {
    mocks.tx.product.findUnique.mockResolvedValueOnce({ id: 'p-1', stock: 0, available: false });
    await RemoveProduct(new Request('http://x', { method: 'DELETE' }) as never, ctx());
    const args = mocks.tx.product.update.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(args.data.available).toBe(true);
  });

  it('returns 400 NOT_A_PRODUCT_ITEM when item is not a PRODUCT', async () => {
    mocks.prisma.invoiceItem.findUnique.mockResolvedValueOnce({
      id: 'ii-1', invoiceId: 'inv-1', category: 'BOARDING', productId: null, quantity: 1, total: 100,
    });
    const res = await RemoveProduct(new Request('http://x', { method: 'DELETE' }) as never, ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('NOT_A_PRODUCT_ITEM');
  });

  it('returns 404 ITEM_NOT_FOUND when item belongs to another invoice', async () => {
    mocks.prisma.invoiceItem.findUnique.mockResolvedValueOnce({
      id: 'ii-1', invoiceId: 'inv-OTHER', category: 'PRODUCT', productId: 'p-1', quantity: 1, total: 100,
    });
    const res = await RemoveProduct(new Request('http://x', { method: 'DELETE' }) as never, ctx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('ITEM_NOT_FOUND');
  });
});

// ===========================================================================
// PATCH /api/admin/bookings/[id]/update-product/[itemId]
// ===========================================================================
describe('PATCH /api/admin/bookings/[id]/update-product/[itemId]', () => {
  const ctx = (id = 'b1', itemId = 'ii-1') => ({ params: Promise.resolve({ id, itemId }) });

  beforeEach(() => {
    mocks.prisma.booking.findFirst.mockResolvedValue({ invoice: { id: 'inv-1' } });
    mocks.prisma.invoiceItem.findUnique.mockResolvedValue({
      id: 'ii-1', invoiceId: 'inv-1', category: 'PRODUCT',
      productId: 'p-1', quantity: 2, unitPrice: 50, total: 100,
    });
  });

  it('increments quantity → decrements stock by delta', async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([{ id: 'p-1', stock: 10, available: true }]);
    mocks.tx.invoiceItem.update.mockResolvedValueOnce({
      id: 'ii-1', description: 'X', quantity: 5, unitPrice: 50, total: 250, category: 'PRODUCT',
    });

    const res = await UpdateProduct(
      jsonReq('http://x', 'PATCH', { quantity: 5 }),
      ctx(),
    );
    expect(res.status).toBe(200);
    // delta = 5 - 2 = 3
    expect(mocks.tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stock: { decrement: 3 } }) }),
    );
    // Note : Invoice.amount n'est plus écrit côté code (trigger PG recompute).
    // On vérifie seulement la mise à jour de version (optimistic lock).
    expect(mocks.tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: { increment: 1 } }) }),
    );
  });

  it('decrements quantity → restores stock by abs(delta) and recalculates total', async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([{ id: 'p-1', stock: 8, available: true }]);
    mocks.tx.invoiceItem.update.mockResolvedValueOnce({
      id: 'ii-1', description: 'X', quantity: 1, unitPrice: 50, total: 50, category: 'PRODUCT',
    });

    const res = await UpdateProduct(jsonReq('http://x', 'PATCH', { quantity: 1 }), ctx());
    expect(res.status).toBe(200);
    // delta = -1 → stock decrement: -1 = stock returned
    expect(mocks.tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stock: { decrement: -1 } }) }),
    );
    const updateItemArgs = mocks.tx.invoiceItem.update.mock.calls[0]![0] as { data: { quantity: number } };
    expect(updateItemArgs.data.quantity).toBe(1);
  });

  it('returns 400 OUT_OF_STOCK when delta exceeds available stock', async () => {
    mocks.tx.$queryRaw.mockResolvedValueOnce([{ id: 'p-1', stock: 1, available: true }]);
    const res = await UpdateProduct(jsonReq('http://x', 'PATCH', { quantity: 10 }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('OUT_OF_STOCK');
    expect(mocks.tx.invoiceItem.update).not.toHaveBeenCalled();
  });
});
