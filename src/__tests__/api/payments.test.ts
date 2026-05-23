/**
 * Unit tests — POST /api/invoices/[id]/payments (Sprint 1 sécurité)
 *
 * Couvre :
 *   - Idempotency-Key replay → 409 DUPLICATE_REQUEST
 *   - Overpayment hard-rejected → 400 OVERPAYMENT (au lieu de "briefly accepted")
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    invoice: { findUnique: vi.fn() },
    payment: { create: vi.fn() },
    // recordPayment's race guard locks the invoice in a tx (FOR UPDATE) then
    // re-checks. The tx delegates to the same mock fns so existing assertions
    // on invoice.findUnique / payment.create still hold.
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  tryAcquireIdempotency: vi.fn(),
  allocatePayments: vi.fn().mockResolvedValue(undefined),
  logAction: vi.fn().mockResolvedValue(undefined),
  sendSMS: vi.fn().mockResolvedValue(undefined),
  sendAdminSMS: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/payments', () => ({ allocatePayments: mocks.allocatePayments }));
vi.mock('@/lib/log', () => ({
  logAction: mocks.logAction,
  LOG_ACTIONS: { INVOICE_PAID: 'INVOICE_PAID' },
}));
vi.mock('@/lib/sms', () => ({
  sendSMS: mocks.sendSMS,
  sendAdminSMS: mocks.sendAdminSMS, normalizePhone: (p: string) => p,
  formatMAD: (n: number) => `${n} MAD`,
}));
vi.mock('@/lib/idempotency', () => ({
  tryAcquireIdempotency: mocks.tryAcquireIdempotency,
  IdempotencyKeyInvalidError: class IdempotencyKeyInvalidError extends Error {},
}));

import { POST } from '@/app/api/invoices/[id]/payments/route';

function makeRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/invoices/inv-1/payments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: 'inv-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
  mocks.tryAcquireIdempotency.mockResolvedValue({ acquired: true });
  mocks.prisma.$executeRaw.mockResolvedValue(1);
  // The in-tx re-check only runs on the happy path (overpayment/cancelled/404
  // are caught by the pre-check before the tx). A permissive in-tx invoice
  // read keeps it decoupled from the route's findUnique Once-queue. payment.create
  // stays shared so assertions on it hold.
  mocks.prisma.$transaction.mockImplementation(async (fn: unknown) =>
    typeof fn === 'function'
      ? (fn as (tx: unknown) => unknown)({
          $executeRaw: async () => 1,
          invoice: { findUnique: async () => ({ status: 'PENDING', amount: 1_000_000, payments: [] }) },
          payment: { create: mocks.prisma.payment.create },
        })
      : fn,
  );
  mocks.prisma.invoice.findUnique.mockResolvedValue({
    id: 'inv-1',
    invoiceNumber: 'DU-1',
    status: 'PENDING',
    amount: 100,
    clientDisplayName: null,
    payments: [],
    client: { name: 'Alice', email: 'a@a.com', phone: '+212', isWalkIn: true, role: 'CLIENT' },
    items: [],
  });
});

describe('POST /api/invoices/[id]/payments — Idempotency-Key', () => {
  it('returns 409 DUPLICATE_REQUEST when replay detected', async () => {
    mocks.tryAcquireIdempotency.mockResolvedValueOnce({ acquired: false });
    const res = await POST(
      makeRequest({ amount: 50, paymentMethod: 'CASH' }, { 'idempotency-key': 'abcd1234' }),
      params,
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('DUPLICATE_REQUEST');
    expect(mocks.prisma.payment.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/invoices/[id]/payments — overpayment', () => {
  it('returns 400 OVERPAYMENT when alreadyPaid + amount exceeds invoice total', async () => {
    mocks.prisma.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-1',
      invoiceNumber: 'DU-1',
      status: 'PENDING',
      amount: 100,
      clientDisplayName: null,
      payments: [{ amount: 80 }],
      client: { name: 'Alice', email: 'a@a.com', phone: '+212', isWalkIn: true, role: 'CLIENT' },
      items: [],
    });
    const res = await POST(
      makeRequest({ amount: 25, paymentMethod: 'CASH' }),
      params,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('OVERPAYMENT');
    expect(json.invoiceTotal).toBe(100);
    expect(json.alreadyPaid).toBe(80);
    expect(json.attempted).toBe(25);
    expect(mocks.prisma.payment.create).not.toHaveBeenCalled();
  });

  it('race guard: rejects OVERPAYMENT detected only by the in-tx re-read', async () => {
    // Snapshot pre-check sees a stale invoice (no payments) and passes — but a
    // concurrent payment committed first, so the in-tx FOR-UPDATE re-read shows
    // the invoice already fully paid → OVERPAYMENT, no payment inserted, no 500.
    mocks.prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'DU-1',
      status: 'PENDING',
      amount: 100,
      clientDisplayName: null,
      payments: [], // stale snapshot → pre-check passes
      client: { name: 'Alice', email: 'a@a.com', phone: '+212', isWalkIn: true, role: 'CLIENT' },
      items: [],
    });
    mocks.prisma.$transaction.mockImplementationOnce(async (fn: unknown) =>
      (fn as (tx: unknown) => unknown)({
        $executeRaw: async () => 1,
        // fresh read inside the lock: already fully paid by a concurrent request
        invoice: { findUnique: async () => ({ status: 'PENDING', amount: 100, payments: [{ amount: 100 }] }) },
        payment: { create: mocks.prisma.payment.create },
      }),
    );
    const res = await POST(makeRequest({ amount: 50, paymentMethod: 'CASH' }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('OVERPAYMENT');
    expect(mocks.prisma.payment.create).not.toHaveBeenCalled();
  });

  it('accepts payment within 0.01 MAD tolerance', async () => {
    mocks.prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'DU-1',
      status: 'PENDING',
      amount: 100,
      clientDisplayName: null,
      payments: [{ amount: 99.995 }],
      client: { name: 'Alice', email: 'a@a.com', phone: '+212', isWalkIn: true, role: 'CLIENT' },
      items: [],
    });
    mocks.prisma.payment.create.mockResolvedValue({ id: 'p-1' });
    const res = await POST(
      makeRequest({ amount: 0.01, paymentMethod: 'CASH' }),
      params,
    );
    expect(res.status).toBe(201);
    expect(mocks.prisma.payment.create).toHaveBeenCalled();
  });
});
