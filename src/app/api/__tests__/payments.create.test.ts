/**
 * Integration tests — POST /api/invoices/[id]/payments.
 *
 * Focus:
 *  - role gate (ADMIN/SUPERADMIN only)
 *  - overpayment guard (alreadyPaid + parsedAmount > invoice.amount + 0.01)
 *  - allocation runs after Payment.create (status transition handled by
 *    `allocatePayments` — we assert it is invoked).
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    invoice: { findUnique: vi.fn() },
    payment: { create: vi.fn() },
  },
  allocatePayments: vi.fn().mockResolvedValue(undefined),
  logAction: vi.fn().mockResolvedValue(undefined),
  tryAcquireIdempotency: vi.fn().mockResolvedValue({ acquired: true }),
  sendSMS: vi.fn().mockResolvedValue(true),
  sendAdminSMS: vi.fn().mockResolvedValue(true),
  cacheDel: vi.fn().mockResolvedValue(undefined),
  withSpan: vi.fn(async (_n: string, _a: unknown, fn: () => unknown) => fn()),
}));

vi.mock('../../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/payments', () => ({ allocatePayments: mocks.allocatePayments }));
vi.mock('@/lib/log', () => ({
  logAction: mocks.logAction,
  LOG_ACTIONS: { INVOICE_PAID: 'INVOICE_PAID' },
}));
vi.mock('@/lib/idempotency', () => ({
  tryAcquireIdempotency: mocks.tryAcquireIdempotency,
  IdempotencyKeyInvalidError: class IdempotencyKeyInvalidError extends Error {},
}));
vi.mock('@/lib/sms', () => ({
  sendSMS: mocks.sendSMS,
  sendAdminSMS: mocks.sendAdminSMS,
  formatMAD: (n: number) => `${n} MAD`,
}));
vi.mock('@/lib/decimal', () => ({ toNumber: (v: unknown) => Number(v ?? 0) }));
vi.mock('@/lib/cache', () => ({ cacheDel: mocks.cacheDel }));
vi.mock('@/lib/observability', () => ({ withSpan: mocks.withSpan }));

import { POST } from '@/app/api/invoices/[id]/payments/route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/invoices/inv-1/payments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: 'inv-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
  mocks.tryAcquireIdempotency.mockResolvedValue({ acquired: true });
  mocks.allocatePayments.mockResolvedValue(undefined);
});

describe('POST /api/invoices/[id]/payments — role gate', () => {
  it('rejects CLIENT with 403', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'c1', role: 'CLIENT' } });
    const res = await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), params);
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated with 403', async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const res = await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), params);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/invoices/[id]/payments — overpayment', () => {
  it('rejects with 400 OVERPAYMENT when amount > remaining', async () => {
    mocks.prisma.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-1',
      status: 'PENDING',
      amount: 200,
      invoiceNumber: 'DU-2026-0001',
      clientDisplayName: null,
      payments: [{ amount: 150 }],
      client: { name: 'Foo', email: 'f@x.com', phone: '+212', isWalkIn: false, role: 'CLIENT' },
    });
    const res = await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('OVERPAYMENT');
    expect(body.invoiceTotal).toBe(200);
    expect(body.alreadyPaid).toBe(150);
    expect(body.attempted).toBe(100);
    expect(mocks.prisma.payment.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/invoices/[id]/payments — happy paths', () => {
  beforeEach(() => {
    mocks.prisma.payment.create.mockResolvedValue({ id: 'pay-1' });
  });

  it('creates the payment + allocates when amount reaches the total (status flip handled by allocatePayments)', async () => {
    mocks.prisma.invoice.findUnique
      .mockResolvedValueOnce({
        id: 'inv-1',
        status: 'PENDING',
        amount: 200,
        invoiceNumber: 'DU-2026-0002',
        clientDisplayName: null,
        payments: [],
        client: { name: 'Foo', email: 'f@x.com', phone: '+212', isWalkIn: true, role: 'CLIENT' },
      })
      .mockResolvedValueOnce({ id: 'inv-1', status: 'PAID', items: [], payments: [], client: {} });

    const res = await POST(makeReq({ amount: 200, paymentMethod: 'CASH' }), params);
    expect(res.status).toBe(201);
    expect(mocks.prisma.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ invoiceId: 'inv-1', amount: 200, paymentMethod: 'CASH' }),
    });
    expect(mocks.allocatePayments).toHaveBeenCalledWith('inv-1');
  });

  it('creates the payment + allocates for a partial amount (status remains PENDING via allocator)', async () => {
    mocks.prisma.invoice.findUnique
      .mockResolvedValueOnce({
        id: 'inv-1',
        status: 'PENDING',
        amount: 200,
        invoiceNumber: 'DU-2026-0003',
        clientDisplayName: null,
        payments: [],
        client: { name: 'Bar', email: 'b@x.com', phone: '+212', isWalkIn: true, role: 'CLIENT' },
      })
      .mockResolvedValueOnce({ id: 'inv-1', status: 'PARTIALLY_PAID', items: [], payments: [], client: {} });

    const res = await POST(makeReq({ amount: 80, paymentMethod: 'CARD' }), params);
    expect(res.status).toBe(201);
    expect(mocks.allocatePayments).toHaveBeenCalledWith('inv-1');
  });
});
