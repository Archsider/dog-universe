/**
 * Unit tests — Product stock concurrency guard
 *
 * The three product mutation routes (admin add, client add, admin update qty)
 * MUST acquire a row-level lock on the Product before reading stock and
 * decrementing, otherwise two concurrent requests reading stock=1 could both
 * pass the check and over-sell.
 *
 * We mock prisma.$transaction so the route's transaction callback runs against
 * a fake `tx` that records the order of operations. Then we assert :
 *   1. $queryRaw was called with a SQL fragment containing "FOR UPDATE"
 *   2. product.update was called AFTER $queryRaw
 *
 * Since the routes use Next.js 15 App Router, we exercise them via their
 * exported POST/PATCH handlers with synthetic Request objects.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const callOrder: string[] = [];
  const tx = {
    $queryRaw: vi.fn(),
    invoiceItem: {
      create: vi.fn(),
      update: vi.fn(),
    },
    product: {
      update: vi.fn(),
    },
    invoice: {
      update: vi.fn(),
    },
  };
  return {
    callOrder,
    tx,
    prisma: {
      booking: {
        findFirst: vi.fn(),
      },
      invoiceItem: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(),
    },
    auth: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('../../../auth', () => ({ auth: mocks.auth }));
vi.mock('../../../../auth', () => ({ auth: mocks.auth }));
vi.mock('../../../../../auth', () => ({ auth: mocks.auth }));
vi.mock('../../../../../../auth', () => ({ auth: mocks.auth }));
vi.mock('../../../../../../../auth', () => ({ auth: mocks.auth }));
vi.mock('../../../../../../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/notifications', () => ({
  notifyAdminsProductOrder: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: Record<string, unknown>): Request {
  return new Request('https://example.com/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function configureTransaction(productRow: {
  id: string;
  stock: number;
  available: boolean;
  price: number;
  name: string;
  brand: string | null;
  reference: string | null;
}) {
  // $queryRaw returns the locked row
  mocks.tx.$queryRaw.mockImplementation(async () => {
    mocks.callOrder.push('$queryRaw');
    return [productRow];
  });
  mocks.tx.invoiceItem.create.mockImplementation(async (args: unknown) => {
    mocks.callOrder.push('invoiceItem.create');
    const data = (args as { data: Record<string, unknown> }).data;
    return { id: 'item-new', ...data, quantity: data.quantity, unitPrice: data.unitPrice, total: data.total, category: data.category, description: data.description };
  });
  mocks.tx.invoiceItem.update.mockImplementation(async (args: unknown) => {
    mocks.callOrder.push('invoiceItem.update');
    const data = (args as { data: Record<string, unknown> }).data;
    return { id: 'item-x', quantity: data.quantity ?? 1, unitPrice: 10, total: data.total ?? 10, category: 'PRODUCT', description: 'desc' };
  });
  mocks.tx.product.update.mockImplementation(async () => {
    mocks.callOrder.push('product.update');
    return {};
  });
  mocks.tx.invoice.update.mockImplementation(async () => {
    mocks.callOrder.push('invoice.update');
    return {};
  });
  mocks.prisma.$transaction.mockImplementation(async (cb: (t: typeof mocks.tx) => Promise<unknown>) => {
    return cb(mocks.tx);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.callOrder.length = 0;
});

// ===========================================================================
// admin add-product (POST /api/admin/bookings/[id]/products)
// ===========================================================================
describe('POST /api/admin/bookings/[id]/products — FOR UPDATE before stock decrement', () => {
  it('locks the Product row via $queryRaw FOR UPDATE before product.update', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    mocks.prisma.booking.findFirst.mockResolvedValue({
      id: 'b1',
      invoice: { id: 'inv-1', status: 'PENDING', amount: 0, version: 1 },
    });
    configureTransaction({
      id: 'prod-1', stock: 5, available: true, price: 10,
      name: 'Croquettes', brand: 'Acme', reference: 'A1',
    });

    const { POST } = await import('@/app/api/admin/bookings/[id]/products/route');
    const res = await POST(
      makeRequest({ productId: 'prod-1', quantity: 2 }) as never,
      { params: Promise.resolve({ id: 'b1' }) },
    );

    expect(res.status).toBe(200);
    // $queryRaw must run before product.update
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.tx.product.update).toHaveBeenCalledTimes(1);
    expect(mocks.callOrder.indexOf('$queryRaw')).toBeLessThan(mocks.callOrder.indexOf('product.update'));

    // Verify the SQL fragment includes FOR UPDATE
    const sqlArg = mocks.tx.$queryRaw.mock.calls[0][0];
    // Tagged template invocation: first arg is the strings array
    const sqlText = Array.isArray(sqlArg) ? sqlArg.join('?') : String(sqlArg);
    expect(sqlText).toMatch(/FOR UPDATE/i);
  });

  it('rejects when locked product has insufficient stock (OUT_OF_STOCK)', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    mocks.prisma.booking.findFirst.mockResolvedValue({
      id: 'b1',
      invoice: { id: 'inv-1', status: 'PENDING', amount: 0, version: 1 },
    });
    configureTransaction({
      id: 'prod-1', stock: 1, available: true, price: 10,
      name: 'X', brand: null, reference: null,
    });

    const { POST } = await import('@/app/api/admin/bookings/[id]/products/route');
    const res = await POST(
      makeRequest({ productId: 'prod-1', quantity: 5 }) as never,
      { params: Promise.resolve({ id: 'b1' }) },
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('OUT_OF_STOCK');
    // product.update must NOT have been called
    expect(mocks.tx.product.update).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// client add-product (POST /api/client/bookings/[id]/add-product)
// ===========================================================================
describe('POST /api/client/bookings/[id]/add-product — FOR UPDATE', () => {
  it('locks the Product row before decrementing stock', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'client-1', role: 'CLIENT', name: 'Alice' } });
    mocks.prisma.booking.findFirst.mockResolvedValue({
      id: 'b1',
      status: 'CONFIRMED',
      bookingPets: [{ pet: { name: 'Rex' } }],
      invoice: { id: 'inv-1', status: 'PENDING', amount: 0 },
    });
    configureTransaction({
      id: 'prod-1', stock: 10, available: true, price: 25,
      name: 'Treats', brand: null, reference: null,
    });

    const { POST } = await import('@/app/api/client/bookings/[id]/add-product/route');
    const res = await POST(
      makeRequest({ productId: 'prod-1', quantity: 1 }) as never,
      { params: Promise.resolve({ id: 'b1' }) },
    );

    expect(res.status).toBe(200);
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1);
    const sqlArg = mocks.tx.$queryRaw.mock.calls[0][0];
    const sqlText = Array.isArray(sqlArg) ? sqlArg.join('?') : String(sqlArg);
    expect(sqlText).toMatch(/FOR UPDATE/i);
    expect(mocks.callOrder.indexOf('$queryRaw')).toBeLessThan(mocks.callOrder.indexOf('product.update'));
  });
});

// ===========================================================================
// admin update-product qty (PATCH /api/admin/bookings/[id]/update-product/[itemId])
// ===========================================================================
describe('PATCH /api/admin/bookings/[id]/update-product/[itemId] — FOR UPDATE', () => {
  it('locks the Product row before quantity / stock adjustment', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    mocks.prisma.booking.findFirst.mockResolvedValue({ invoice: { id: 'inv-1' } });
    mocks.prisma.invoiceItem.findUnique.mockResolvedValue({
      id: 'item-1',
      invoiceId: 'inv-1',
      category: 'PRODUCT',
      productId: 'prod-1',
      quantity: 2,
      unitPrice: 10,
      total: 20,
    });
    configureTransaction({
      id: 'prod-1', stock: 5, available: true, price: 10,
      name: 'X', brand: null, reference: null,
    });

    const { PATCH } = await import('@/app/api/admin/bookings/[id]/update-product/[itemId]/route');
    const req = new Request('https://example.com/x', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: 4 }),
    });
    const res = await PATCH(
      req as never,
      { params: Promise.resolve({ id: 'b1', itemId: 'item-1' }) },
    );

    expect(res.status).toBe(200);
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1);
    const sqlArg = mocks.tx.$queryRaw.mock.calls[0][0];
    const sqlText = Array.isArray(sqlArg) ? sqlArg.join('?') : String(sqlArg);
    expect(sqlText).toMatch(/FOR UPDATE/i);
    expect(mocks.callOrder.indexOf('$queryRaw')).toBeLessThan(mocks.callOrder.indexOf('product.update'));
  });
});
