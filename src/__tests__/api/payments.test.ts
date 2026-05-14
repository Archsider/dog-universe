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
