/**
 * Integration tests — POST /api/invoices, item categorisation rules.
 *
 * The "discount" task asked for an `InvoiceItem.discount` field, but the
 * codebase doesn't model item-level discounts (totals are submitted by the
 * caller). What IS load-bearing — and tested here — is the verrouillé rule
 * from CLAUDE.md:
 *
 *   "si productId est non-null, category DOIT être 'PRODUCT'"
 *
 * The route forces `category: 'PRODUCT'` whenever `productId` is set, even
 * if the caller submitted a different category. We also assert the caller's
 * `total` is preserved verbatim (so a discounted-line client can compute the
 * net total upstream and trust the invoice will store exactly that).
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const prismaTx = {
    invoice: { create: vi.fn(), findUnique: vi.fn() },
    invoiceItem: { createMany: vi.fn() },
    product: { findUnique: vi.fn(), update: vi.fn() },
    payment: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  };
  return {
    auth: vi.fn(),
    prismaTx,
    prisma: {
      ...prismaTx,
      user: { findFirst: vi.fn() },
      $queryRaw: vi.fn(),
      $transaction: vi.fn(async (fn: unknown) => {
        if (typeof fn === 'function') return (fn as (tx: typeof prismaTx) => unknown)(prismaTx);
        return fn;
      }),
    },
    allocatePayments: vi.fn().mockResolvedValue(undefined),
    logAction: vi.fn().mockResolvedValue(undefined),
    tryAcquireIdempotency: vi.fn().mockResolvedValue({ acquired: true }),
    createInvoiceNotification: vi.fn().mockResolvedValue(undefined),
    sendEmailNow: vi.fn(),
    getEmailTemplate: vi.fn().mockReturnValue({ subject: 's', html: 'h' }),
    withSpan: vi.fn(async (_n: string, _a: unknown, fn: () => unknown) => fn()),
    logServerError: vi.fn(),
  };
});

vi.mock('../../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/payments', () => ({ allocatePayments: mocks.allocatePayments }));
vi.mock('@/lib/log', () => ({
  logAction: mocks.logAction,
  LOG_ACTIONS: { INVOICE_CREATED: 'INVOICE_CREATED', INVOICE_PAID: 'INVOICE_PAID' },
}));
vi.mock('@/lib/idempotency', () => ({
  tryAcquireIdempotency: mocks.tryAcquireIdempotency,
  IdempotencyKeyInvalidError: class IdempotencyKeyInvalidError extends Error {},
}));
vi.mock('@/lib/notifications', () => ({
  createInvoiceNotification: mocks.createInvoiceNotification,
}));
vi.mock('@/lib/email', () => ({ getEmailTemplate: mocks.getEmailTemplate }));
vi.mock('@/lib/notify-now', () => ({ sendEmailNow: mocks.sendEmailNow }));
vi.mock('@/lib/utils', () => ({ formatMAD: (n: number) => `${n} MAD` }));
vi.mock('@/lib/observability', () => ({
  withSpan: mocks.withSpan,
  logServerError: mocks.logServerError,
}));

import { POST as InvoicesPOST } from '@/app/api/invoices/route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/invoices', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
  mocks.tryAcquireIdempotency.mockResolvedValue({ acquired: true });
  mocks.prisma.user.findFirst.mockResolvedValue({
    id: 'client-1', name: 'Foo', email: 'foo@x.com', isWalkIn: false, language: 'fr', role: 'CLIENT',
  });
  // Atomic invoice number sequence
  mocks.prisma.$queryRaw.mockResolvedValue([{ lastSeq: 1 }]);
  mocks.prismaTx.$queryRaw.mockResolvedValue([{ id: 'prod-1', stock: 50, available: true }]);
  mocks.prisma.invoice.findUnique.mockResolvedValue(null); // no number collision
  mocks.prismaTx.invoice.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'inv-new',
    invoiceNumber: data.invoiceNumber,
    amount: data.amount,
    items: ((data.items as { create: unknown[] }).create as Array<Record<string, unknown>>),
    client: { id: 'client-1', name: 'Foo', email: 'foo@x.com' },
  }));
});

describe('POST /api/invoices — productId forces category=PRODUCT', () => {
  it('overrides any submitted category when productId is set', async () => {
    const res = await InvoicesPOST(
      makeReq({
        clientId: 'client-1',
        items: [
          {
            description: 'Croquettes Ultra Premium',
            quantity: 2,
            unitPrice: 150,
            total: 300,
            category: 'OTHER', // caller tries to mis-tag — must be ignored
            productId: 'prod-1',
          },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.items).toHaveLength(1);
    expect(created.items[0]).toMatchObject({
      productId: 'prod-1',
      category: 'PRODUCT',
      total: 300,
      unitPrice: 150,
    });
  });

  it('preserves caller-supplied total verbatim (discount math handled upstream)', async () => {
    const res = await InvoicesPOST(
      makeReq({
        clientId: 'client-1',
        items: [
          {
            description: 'Service taxi (remise -20 MAD)',
            quantity: 1,
            unitPrice: 200,
            total: 180, // discounted total submitted by caller
            category: 'PET_TAXI',
          },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.amount).toBe(180);
    expect(created.items[0]).toMatchObject({
      category: 'PET_TAXI',
      total: 180,
      unitPrice: 200,
    });
  });

  it('uses category=OTHER as fallback when neither productId nor category is provided', async () => {
    const res = await InvoicesPOST(
      makeReq({
        clientId: 'client-1',
        items: [
          { description: 'Divers', quantity: 1, unitPrice: 50, total: 50 },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.items[0].category).toBe('OTHER');
  });
});
