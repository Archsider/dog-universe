/**
 * Unit tests — /api/admin/bookings/[id]/items + /[itemId] + /invoices/supplementary
 *
 * Mocks @/lib/prisma + auth, calls handlers directly. Covers permissions,
 * Zod validation, transaction success paths, and the business-logic error
 * codes the UI relies on.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// $transaction(callback) is called inside the route handlers as
//   prisma.$transaction(async (tx) => { ... })
// In tests we pass the same `mocks.prisma` object as `tx` so every
// `tx.foo.bar(...)` resolves to the corresponding vi.fn() mock.
type TxCallback = (tx: unknown) => Promise<unknown>;
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    booking: { findFirst: vi.fn() },
    bookingItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    product: { update: vi.fn() },
    invoice: { create: vi.fn(), findUnique: vi.fn() },
    invoiceItem: { create: vi.fn() },
    actionLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));

import { NextRequest } from 'next/server';

const ADMIN = { user: { id: 'u_admin', role: 'ADMIN' } };
const CLIENT = { user: { id: 'u_client', role: 'CLIENT' } };

function postReq(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/admin/bookings/b_1/items', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function patchReq(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/admin/bookings/b_1/items/i_1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(ADMIN);
  // Default tx: pass through the callback with the prisma mock as the tx client.
  mocks.prisma.$transaction.mockImplementation((async (cb: TxCallback) => {
    return cb(mocks.prisma);
  }) as never);
});

// ─── POST /items ────────────────────────────────────────────────────────────
describe('POST /api/admin/bookings/[id]/items', () => {
  it('403 for CLIENT', async () => {
    mocks.auth.mockResolvedValue(CLIENT);
    const { POST } = await import('@/app/api/admin/bookings/[id]/items/route');
    const res = await POST(postReq({ type: 'catalog', productId: 'p_1', quantity: 1 }), { params: Promise.resolve({ id: 'b_1' }) });
    expect(res.status).toBe(403);
  });

  it('400 when type is unknown', async () => {
    const { POST } = await import('@/app/api/admin/bookings/[id]/items/route');
    const res = await POST(postReq({ type: 'invalid' }), { params: Promise.resolve({ id: 'b_1' }) });
    expect(res.status).toBe(400);
  });

  it('404 when booking not found', async () => {
    mocks.prisma.booking.findFirst.mockResolvedValue(null);
    const { POST } = await import('@/app/api/admin/bookings/[id]/items/route');
    const res = await POST(
      postReq({ type: 'catalog', productId: 'p_1', quantity: 1 }),
      { params: Promise.resolve({ id: 'b_x' }) },
    );
    expect(res.status).toBe(404);
  });

  it('catalog: 400 INSUFFICIENT_STOCK when stock < quantity', async () => {
    mocks.prisma.booking.findFirst.mockResolvedValue({ id: 'b_1' });
    mocks.prisma.$queryRaw.mockResolvedValue([{
      id: 'p_1', stock: 1, price: 100, name: 'X', brand: null, reference: null,
      available: true, isArchived: false,
    }]);
    const { POST } = await import('@/app/api/admin/bookings/[id]/items/route');
    const res = await POST(
      postReq({ type: 'catalog', productId: 'p_1', quantity: 5 }),
      { params: Promise.resolve({ id: 'b_1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INSUFFICIENT_STOCK');
  });

  it('catalog: 400 PRODUCT_UNAVAILABLE when archived', async () => {
    mocks.prisma.booking.findFirst.mockResolvedValue({ id: 'b_1' });
    mocks.prisma.$queryRaw.mockResolvedValue([{
      id: 'p_1', stock: 10, price: 100, name: 'X', brand: null, reference: null,
      available: true, isArchived: true,
    }]);
    const { POST } = await import('@/app/api/admin/bookings/[id]/items/route');
    const res = await POST(
      postReq({ type: 'catalog', productId: 'p_1', quantity: 1 }),
      { params: Promise.resolve({ id: 'b_1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('PRODUCT_UNAVAILABLE');
  });

  it('catalog: success decrements stock + logs', async () => {
    mocks.prisma.booking.findFirst.mockResolvedValue({ id: 'b_1' });
    mocks.prisma.$queryRaw.mockResolvedValue([{
      id: 'p_1', stock: 10, price: 350, name: 'Royal Canin', brand: 'RC', reference: null,
      available: true, isArchived: false,
    }]);
    mocks.prisma.bookingItem.create.mockResolvedValue({
      id: 'i_1', bookingId: 'b_1', productId: 'p_1', description: 'Royal Canin · RC',
      quantity: 2, unitPrice: 350, total: 700, category: 'PRODUCT', version: 0,
    });
    const { POST } = await import('@/app/api/admin/bookings/[id]/items/route');
    const res = await POST(
      postReq({ type: 'catalog', productId: 'p_1', quantity: 2 }),
      { params: Promise.resolve({ id: 'b_1' }) },
    );
    expect(res.status).toBe(201);
    expect(mocks.prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: { decrement: 2 } } }),
    );
    expect(mocks.prisma.actionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'BOOKING_ITEM_ADDED_FROM_CATALOG' }) }),
    );
  });

  it('free EXTRA_SERVICE: success without product touched', async () => {
    mocks.prisma.booking.findFirst.mockResolvedValue({ id: 'b_1' });
    mocks.prisma.bookingItem.create.mockResolvedValue({
      id: 'i_2', bookingId: 'b_1', productId: null, description: 'Médicament',
      quantity: 1, unitPrice: 150, total: 150, category: 'EXTRA_SERVICE', version: 0,
    });
    const { POST } = await import('@/app/api/admin/bookings/[id]/items/route');
    const res = await POST(
      postReq({ type: 'free', description: 'Médicament', category: 'EXTRA_SERVICE', quantity: 1, unitPrice: 150 }),
      { params: Promise.resolve({ id: 'b_1' }) },
    );
    expect(res.status).toBe(201);
    expect(mocks.prisma.product.update).not.toHaveBeenCalled();
    expect(mocks.prisma.actionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'BOOKING_ITEM_ADDED_FREE' }) }),
    );
  });

  it('free DISCOUNT: rejected when unitPrice > 0', async () => {
    mocks.prisma.booking.findFirst.mockResolvedValue({ id: 'b_1' });
    const { POST } = await import('@/app/api/admin/bookings/[id]/items/route');
    const res = await POST(
      postReq({ type: 'free', description: 'Réduc', category: 'DISCOUNT', quantity: 1, unitPrice: 50 }),
      { params: Promise.resolve({ id: 'b_1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('DISCOUNT_MUST_BE_NEGATIVE');
  });

  it('free DISCOUNT: accepts negative unitPrice', async () => {
    mocks.prisma.booking.findFirst.mockResolvedValue({ id: 'b_1' });
    mocks.prisma.bookingItem.create.mockResolvedValue({
      id: 'i_3', bookingId: 'b_1', productId: null, description: 'Réduc fidélité',
      quantity: 1, unitPrice: -50, total: -50, category: 'DISCOUNT', version: 0,
    });
    const { POST } = await import('@/app/api/admin/bookings/[id]/items/route');
    const res = await POST(
      postReq({ type: 'free', description: 'Réduc fidélité', category: 'DISCOUNT', quantity: 1, unitPrice: -50 }),
      { params: Promise.resolve({ id: 'b_1' }) },
    );
    expect(res.status).toBe(201);
  });
});

// ─── PATCH /items/[itemId] ──────────────────────────────────────────────────
describe('PATCH /api/admin/bookings/[id]/items/[itemId]', () => {
  it('401 for CLIENT', async () => {
    mocks.auth.mockResolvedValue(CLIENT);
    const { PATCH } = await import('@/app/api/admin/bookings/[id]/items/[itemId]/route');
    const res = await PATCH(patchReq({ version: 0, quantity: 2 }), { params: Promise.resolve({ id: 'b_1', itemId: 'i_1' }) });
    expect(res.status).toBe(401);
  });

  it('404 when item missing', async () => {
    mocks.prisma.bookingItem.findFirst.mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/admin/bookings/[id]/items/[itemId]/route');
    const res = await PATCH(patchReq({ version: 0, quantity: 2 }), { params: Promise.resolve({ id: 'b_1', itemId: 'i_x' }) });
    expect(res.status).toBe(404);
  });

  it('409 VERSION_CONFLICT on stale version', async () => {
    mocks.prisma.bookingItem.findFirst.mockResolvedValue({
      id: 'i_1', bookingId: 'b_1', productId: null, description: 'x',
      quantity: 1, unitPrice: 10, total: 10, category: 'OTHER', version: 5,
    });
    const { PATCH } = await import('@/app/api/admin/bookings/[id]/items/[itemId]/route');
    const res = await PATCH(patchReq({ version: 3, quantity: 2 }), { params: Promise.resolve({ id: 'b_1', itemId: 'i_1' }) });
    expect(res.status).toBe(409);
  });

  it('catalog item: 400 CATALOG_FIELD_IMMUTABLE when description is sent', async () => {
    mocks.prisma.bookingItem.findFirst.mockResolvedValue({
      id: 'i_1', bookingId: 'b_1', productId: 'p_1', description: 'Royal Canin',
      quantity: 1, unitPrice: 350, total: 350, category: 'PRODUCT', version: 0,
    });
    const { PATCH } = await import('@/app/api/admin/bookings/[id]/items/[itemId]/route');
    const res = await PATCH(
      patchReq({ version: 0, description: 'Try renaming' }),
      { params: Promise.resolve({ id: 'b_1', itemId: 'i_1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('CATALOG_FIELD_IMMUTABLE');
  });

  it('catalog item: quantity diff adjusts stock', async () => {
    mocks.prisma.bookingItem.findFirst.mockResolvedValue({
      id: 'i_1', bookingId: 'b_1', productId: 'p_1', description: 'Royal Canin',
      quantity: 1, unitPrice: 350, total: 350, category: 'PRODUCT', version: 0,
    });
    mocks.prisma.$queryRaw.mockResolvedValue([{ id: 'p_1', stock: 10 }]);
    mocks.prisma.bookingItem.update.mockResolvedValue({
      id: 'i_1', bookingId: 'b_1', productId: 'p_1', description: 'Royal Canin',
      quantity: 3, unitPrice: 350, total: 1050, category: 'PRODUCT', version: 1,
    });
    const { PATCH } = await import('@/app/api/admin/bookings/[id]/items/[itemId]/route');
    const res = await PATCH(
      patchReq({ version: 0, quantity: 3 }),
      { params: Promise.resolve({ id: 'b_1', itemId: 'i_1' }) },
    );
    expect(res.status).toBe(200);
    expect(mocks.prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: { decrement: 2 } } }),
    );
  });
});

// ─── DELETE /items/[itemId] ─────────────────────────────────────────────────
describe('DELETE /api/admin/bookings/[id]/items/[itemId]', () => {
  it('catalog item: restores stock', async () => {
    mocks.prisma.bookingItem.findFirst.mockResolvedValue({
      id: 'i_1', bookingId: 'b_1', productId: 'p_1', description: 'X',
      quantity: 2, unitPrice: 100, total: 200, category: 'PRODUCT', version: 0,
    });
    const { DELETE } = await import('@/app/api/admin/bookings/[id]/items/[itemId]/route');
    const res = await DELETE(new NextRequest('https://example.com/'), { params: Promise.resolve({ id: 'b_1', itemId: 'i_1' }) });
    expect(res.status).toBe(204);
    expect(mocks.prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: { increment: 2 } } }),
    );
  });

  it('free item: no stock touched', async () => {
    mocks.prisma.bookingItem.findFirst.mockResolvedValue({
      id: 'i_2', bookingId: 'b_1', productId: null, description: 'Médic',
      quantity: 1, unitPrice: 150, total: 150, category: 'EXTRA_SERVICE', version: 0,
    });
    const { DELETE } = await import('@/app/api/admin/bookings/[id]/items/[itemId]/route');
    const res = await DELETE(new NextRequest('https://example.com/'), { params: Promise.resolve({ id: 'b_1', itemId: 'i_2' }) });
    expect(res.status).toBe(204);
    expect(mocks.prisma.product.update).not.toHaveBeenCalled();
  });
});

// ─── Supplementary invoice ──────────────────────────────────────────────────
describe('POST /api/admin/bookings/[id]/invoices/supplementary', () => {
  it('400 NO_MAIN_INVOICE when booking has no invoice', async () => {
    mocks.prisma.booking.findFirst.mockResolvedValue({
      id: 'b_1', clientId: 'c_1', startDate: new Date(), invoice: null,
    });
    const { POST } = await import('@/app/api/admin/bookings/[id]/invoices/supplementary/route');
    const res = await POST(new NextRequest('https://example.com/'), { params: Promise.resolve({ id: 'b_1' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('NO_MAIN_INVOICE');
  });

  it('400 NOTHING_TO_INVOICE when all items already billed', async () => {
    mocks.prisma.booking.findFirst.mockResolvedValue({
      id: 'b_1', clientId: 'c_1', startDate: new Date(),
      invoice: { id: 'inv_1', status: 'PAID' },
    });
    mocks.prisma.bookingItem.findMany.mockResolvedValue([]);
    const { POST } = await import('@/app/api/admin/bookings/[id]/invoices/supplementary/route');
    const res = await POST(new NextRequest('https://example.com/'), { params: Promise.resolve({ id: 'b_1' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('NOTHING_TO_INVOICE');
  });

  it('401 for CLIENT', async () => {
    mocks.auth.mockResolvedValue(CLIENT);
    const { POST } = await import('@/app/api/admin/bookings/[id]/invoices/supplementary/route');
    const res = await POST(new NextRequest('https://example.com/'), { params: Promise.resolve({ id: 'b_1' }) });
    expect(res.status).toBe(401);
  });

  it('201 creates Invoice + back-links each BookingItem', async () => {
    mocks.prisma.booking.findFirst.mockResolvedValue({
      id: 'b_1', clientId: 'c_1', startDate: new Date('2026-05-01'),
      invoice: { id: 'inv_main', status: 'PAID' },
    });
    mocks.prisma.bookingItem.findMany.mockResolvedValue([
      { id: 'i_1', productId: 'p_1', description: 'X', quantity: 1, unitPrice: 100, total: 100, category: 'PRODUCT' },
      { id: 'i_2', productId: null, description: 'Y', quantity: 1, unitPrice: 50, total: 50, category: 'EXTRA_SERVICE' },
    ]);
    mocks.prisma.$queryRaw.mockResolvedValue([{ lastSeq: 42 }]);
    mocks.prisma.invoice.findUnique.mockResolvedValue(null);
    mocks.prisma.invoice.create.mockResolvedValue({
      id: 'inv_supp', invoiceNumber: 'DU-2026-0042', amount: 150, status: 'PENDING',
    });
    mocks.prisma.invoiceItem.create
      .mockResolvedValueOnce({ id: 'ii_1' })
      .mockResolvedValueOnce({ id: 'ii_2' });
    const { POST } = await import('@/app/api/admin/bookings/[id]/invoices/supplementary/route');
    const res = await POST(new NextRequest('https://example.com/'), { params: Promise.resolve({ id: 'b_1' }) });
    expect(res.status).toBe(201);
    expect(mocks.prisma.invoiceItem.create).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.bookingItem.update).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.actionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'SUPPLEMENTARY_INVOICE_CREATED' }) }),
    );
  });
});
