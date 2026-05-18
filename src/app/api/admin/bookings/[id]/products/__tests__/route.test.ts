/**
 * Tests for POST /api/admin/bookings/[id]/products (add product line to invoice).
 * Focus: auth gate, body validation, NO_INVOICE / INVOICE_CANCELLED guards,
 * happy path locks product, creates item, decrements stock atomically.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    booking: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  resolveItemCategory: vi.fn().mockReturnValue('PRODUCT'),
}));

vi.mock('../../../../../../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/billing', () => ({ resolveItemCategory: mocks.resolveItemCategory }));
vi.mock('@/lib/observability', () => ({
  withSpan: vi.fn(async (_n: string, _a: unknown, fn: () => unknown) => fn()),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { POST } from '@/app/api/admin/bookings/[id]/products/route';

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/admin/bookings/b1/products', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const adminSession = { user: { id: 'admin1', role: 'ADMIN' } };

const validBookingRow = {
  id: 'b1',
  invoice: { id: 'inv1', status: 'PENDING', amount: 0, version: 1 },
};

function makeTxStub(opts: {
  productRows?: any[];
  itemCreate?: any;
  productAvailable?: boolean;
  stock?: number;
}) {
  const productRows = opts.productRows ?? [
    {
      id: 'prod1',
      stock: opts.stock ?? 5,
      available: opts.productAvailable ?? true,
      price: 50,
      name: 'Food',
      brand: 'BrandX',
      reference: 'R1',
    },
  ];
  return {
    booking: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $queryRaw: vi.fn().mockResolvedValue(productRows),
    invoiceItem: {
      create: vi.fn().mockResolvedValue(opts.itemCreate ?? {
        id: 'item1',
        description: 'Food · BrandX · réf. R1',
        quantity: 2,
        unitPrice: 50,
        total: 100,
        category: 'PRODUCT',
      }),
    },
    product: { update: vi.fn().mockResolvedValue({}) },
    invoice: { update: vi.fn().mockResolvedValue({}) },
  };
}

describe('POST /api/admin/bookings/[id]/products', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 without session', async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await POST(
      makeReq({ productId: 'prod1', quantity: 2 }),
      { params: Promise.resolve({ id: 'b1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('403 when role is CLIENT', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'c1', role: 'CLIENT' } });
    const res = await POST(
      makeReq({ productId: 'prod1', quantity: 2 }),
      { params: Promise.resolve({ id: 'b1' }) },
    );
    expect(res.status).toBe(403);
  });

  it('400 INVALID_BODY when JSON malformed', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    const req = new NextRequest('http://localhost/api/admin/bookings/b1/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'INVALID_BODY' });
  });

  it('400 INVALID_PARAMS when productId missing', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    const res = await POST(
      makeReq({ quantity: 2 }),
      { params: Promise.resolve({ id: 'b1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('400 INVALID_PARAMS when quantity is 0 or negative', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    const res = await POST(
      makeReq({ productId: 'prod1', quantity: 0 }),
      { params: Promise.resolve({ id: 'b1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('400 INVALID_PARAMS when quantity exceeds cap (1000)', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    const res = await POST(
      makeReq({ productId: 'prod1', quantity: 5000 }),
      { params: Promise.resolve({ id: 'b1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('404 when booking not found', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue(null);
    const res = await POST(
      makeReq({ productId: 'prod1', quantity: 2 }),
      { params: Promise.resolve({ id: 'b1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('400 NO_INVOICE when booking has no invoice', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue({ id: 'b1', invoice: null });
    const res = await POST(
      makeReq({ productId: 'prod1', quantity: 2 }),
      { params: Promise.resolve({ id: 'b1' }) },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'NO_INVOICE' });
  });

  it('400 INVOICE_CANCELLED when invoice is CANCELLED', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue({
      id: 'b1',
      invoice: { id: 'inv1', status: 'CANCELLED', amount: 0, version: 1 },
    });
    const res = await POST(
      makeReq({ productId: 'prod1', quantity: 2 }),
      { params: Promise.resolve({ id: 'b1' }) },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'INVOICE_CANCELLED' });
  });

  it('happy path: creates InvoiceItem + decrements stock atomically', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue(validBookingRow);
    const tx = makeTxStub({ stock: 5 });
    mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const res = await POST(
      makeReq({ productId: 'prod1', quantity: 2 }),
      { params: Promise.resolve({ id: 'b1' }) },
    );
    expect(res.status).toBe(200);

    // Locked product row, created item, decremented stock
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.invoiceItem.create).toHaveBeenCalled();
    const itemCall = tx.invoiceItem.create.mock.calls[0][0];
    expect(itemCall.data.productId).toBe('prod1');
    expect(itemCall.data.quantity).toBe(2);

    expect(tx.product.update).toHaveBeenCalled();
    const productCall = tx.product.update.mock.calls[0][0];
    expect(productCall.where).toEqual({ id: 'prod1' });
    expect(productCall.data.stock).toEqual({ decrement: 2 });
  });

  it('400 OUT_OF_STOCK when quantity > stock', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue(validBookingRow);
    const tx = makeTxStub({ stock: 1 });
    mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const res = await POST(
      makeReq({ productId: 'prod1', quantity: 5 }),
      { params: Promise.resolve({ id: 'b1' }) },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'OUT_OF_STOCK' });
  });

  it('400 PRODUCT_UNAVAILABLE when product flagged unavailable', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue(validBookingRow);
    const tx = makeTxStub({ productAvailable: false });
    mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const res = await POST(
      makeReq({ productId: 'prod1', quantity: 2 }),
      { params: Promise.resolve({ id: 'b1' }) },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'PRODUCT_UNAVAILABLE' });
  });
});
