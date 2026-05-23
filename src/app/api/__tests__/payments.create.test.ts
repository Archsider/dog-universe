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
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  allocatePayments: vi.fn().mockResolvedValue(undefined),
  logAction: vi.fn().mockResolvedValue(undefined),
  tryAcquireIdempotency: vi.fn().mockResolvedValue({ acquired: true }),
  sendSMS: vi.fn().mockResolvedValue(true),
  sendAdminSMS: vi.fn().mockResolvedValue(true),
  // Route actually imports these (sendSmsRespectful, sendSmsNow from
  // @/lib/notify-now) — mocking @/lib/sms alone wasn't enough; the
  // golden-master tests below assert their call shape.
  sendSmsNow: vi.fn(),
  sendSmsRespectful: vi.fn(),
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
  sendAdminSMS: mocks.sendAdminSMS, normalizePhone: (p: string) => p,
  formatMAD: (n: number) => `${n} MAD`,
}));
vi.mock('@/lib/notify-now', () => ({
  sendSmsNow: mocks.sendSmsNow,
  sendSmsRespectful: mocks.sendSmsRespectful,
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
  // recordPayment's race guard: lock + permissive in-tx re-read + insert.
  // Decoupled from the route's findUnique Once-queue; payment.create shared.
  mocks.prisma.$executeRaw.mockResolvedValue(1);
  mocks.prisma.$transaction.mockImplementation(async (fn: unknown) =>
    typeof fn === 'function'
      ? (fn as (tx: unknown) => unknown)({
          $executeRaw: async () => 1,
          invoice: { findUnique: async () => ({ status: 'PENDING', amount: 1_000_000, payments: [] }) },
          payment: { create: mocks.prisma.payment.create },
        })
      : fn,
  );
});

describe('POST /api/invoices/[id]/payments — role gate', () => {
  it('rejects CLIENT with 403', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'c1', role: 'CLIENT' } });
    const res = await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), params);
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated with 401', async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const res = await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), params);
    expect(res.status).toBe(401);
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
    expect(mocks.prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invoiceId: 'inv-1', amount: 200, paymentMethod: 'CASH' }),
      }),
    );
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

// ─── Golden-master coverage (Module 4-A, 2026-05-15) ────────────────────
// These tests lock down behaviour BEFORE the extraction of `recordPayment`
// into `src/lib/payment-allocation.ts`. After the refactor, every assertion
// here must still pass — that's the contract that lets the refactor land
// without silently regressing the money path.

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    status: 'PENDING',
    amount: 200,
    invoiceNumber: 'DU-2026-0099',
    clientDisplayName: null,
    payments: [],
    client: {
      name: 'Foo',
      email: 'f@x.com',
      phone: '+212600000001',
      isWalkIn: false,
      role: 'CLIENT',
    },
    ...overrides,
  };
}

describe('POST /api/invoices/[id]/payments — input validation', () => {
  beforeEach(() => {
    mocks.prisma.invoice.findUnique.mockResolvedValueOnce(makeInvoice());
    mocks.prisma.payment.create.mockResolvedValue({ id: 'pay-1' });
  });

  // NOTE: since PR #168 (shared api-schemas), malformed bodies are
  // rejected by Zod with `error: 'INVALID_BODY'` + a structured `issues`
  // array, BEFORE reaching the recordPayment helper. The helper's
  // `INVALID_AMOUNT` / `INVALID_PAYMENT_METHOD` codes still exist for
  // downstream callers but are no longer reachable via this route.
  it('rejects INVALID_BODY when amount is missing', async () => {
    const res = await POST(makeReq({ paymentMethod: 'CASH' }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_BODY');
    expect(mocks.prisma.payment.create).not.toHaveBeenCalled();
  });

  it('rejects INVALID_BODY when amount is 0', async () => {
    const res = await POST(makeReq({ amount: 0, paymentMethod: 'CASH' }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_BODY');
  });

  it('rejects INVALID_BODY when amount is negative', async () => {
    const res = await POST(makeReq({ amount: -50, paymentMethod: 'CASH' }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_BODY');
  });

  it('rejects INVALID_BODY for unknown payment method', async () => {
    const res = await POST(makeReq({ amount: 100, paymentMethod: 'BITCOIN' }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_BODY');
  });

  it('rejects INVALID_BODY when payment method is missing', async () => {
    const res = await POST(makeReq({ amount: 100 }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_BODY');
  });

  it('rejects INVALID_PAYMENT_DATE when given a garbage string', async () => {
    const res = await POST(
      makeReq({ amount: 100, paymentMethod: 'CASH', paymentDate: 'not-a-date' }),
      params,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_PAYMENT_DATE');
  });

  it('uses the current date when paymentDate is omitted', async () => {
    mocks.prisma.invoice.findUnique.mockResolvedValueOnce(makeInvoice({ id: 'inv-1' }));
    const before = Date.now();
    await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), params);
    const after = Date.now();
    expect(mocks.prisma.payment.create).toHaveBeenCalled();
    const call = mocks.prisma.payment.create.mock.calls[0][0];
    const passedDate = (call.data.paymentDate as Date).getTime();
    expect(passedDate).toBeGreaterThanOrEqual(before);
    expect(passedDate).toBeLessThanOrEqual(after);
  });
});

describe('POST /api/invoices/[id]/payments — invoice status guards', () => {
  it('rejects with 400 INVOICE_CANCELLED on a cancelled invoice', async () => {
    mocks.prisma.invoice.findUnique.mockResolvedValueOnce(
      makeInvoice({ status: 'CANCELLED' }),
    );
    const res = await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVOICE_CANCELLED');
    expect(mocks.prisma.payment.create).not.toHaveBeenCalled();
  });

  it('returns 404 when the invoice does not exist', async () => {
    mocks.prisma.invoice.findUnique.mockResolvedValueOnce(null);
    const res = await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), params);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/invoices/[id]/payments — cross-role authz', () => {
  it('blocks ADMIN from paying an invoice attached to a non-CLIENT user', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'admin-1', role: 'ADMIN' } });
    mocks.prisma.invoice.findUnique.mockResolvedValueOnce(
      makeInvoice({ client: { ...makeInvoice().client, role: 'ADMIN' } }),
    );
    const res = await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), params);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('FORBIDDEN');
    expect(mocks.prisma.payment.create).not.toHaveBeenCalled();
  });

  it('SUPERADMIN can pay any invoice regardless of client role', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'sa-1', role: 'SUPERADMIN' } });
    mocks.prisma.invoice.findUnique
      .mockResolvedValueOnce(makeInvoice({ client: { ...makeInvoice().client, role: 'SUPERADMIN' } }))
      .mockResolvedValueOnce({ id: 'inv-1', status: 'PAID', items: [], payments: [], client: {} });
    mocks.prisma.payment.create.mockResolvedValue({ id: 'pay-9' });
    const res = await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), params);
    expect(res.status).toBe(201);
  });
});

describe('POST /api/invoices/[id]/payments — idempotency', () => {
  it('rejects DUPLICATE_REQUEST on a replayed Idempotency-Key', async () => {
    mocks.tryAcquireIdempotency.mockResolvedValueOnce({ acquired: false });
    const res = await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('DUPLICATE_REQUEST');
    expect(mocks.prisma.payment.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/invoices/[id]/payments — side-effects', () => {
  beforeEach(() => {
    mocks.prisma.payment.create.mockResolvedValue({ id: 'pay-side' });
    mocks.prisma.invoice.findUnique
      .mockResolvedValueOnce(makeInvoice({ amount: 200, payments: [] }))
      .mockResolvedValueOnce({ id: 'inv-1', status: 'PAID', items: [], payments: [], client: {} });
  });

  it('invalidates the revenue cache for the payment date month', async () => {
    await POST(
      makeReq({ amount: 100, paymentMethod: 'CASH', paymentDate: '2026-05-06' }),
      params,
    );
    expect(mocks.cacheDel).toHaveBeenCalledWith('revenue:2026:5');
  });

  it('dispatches client SMS via sendSmsRespectful with COMPTA category', async () => {
    await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), params);
    expect(mocks.sendSmsRespectful).toHaveBeenCalledTimes(1);
    const [smsInput, smsOpts] = mocks.sendSmsRespectful.mock.calls[0];
    expect(smsOpts).toMatchObject({ category: 'COMPTA' });
    expect(smsOpts.recipient).toBe('standard');
    expect(smsInput.to).toBe('+212600000001');
    expect(smsInput.message).toContain('paiement');
  });

  it('routes the client SMS recipient as "walkin" when the client is walk-in', async () => {
    mocks.prisma.invoice.findUnique.mockReset();
    mocks.prisma.invoice.findUnique
      .mockResolvedValueOnce(
        makeInvoice({
          client: {
            name: 'WalkBob',
            email: 'wb@x.com',
            phone: '+212699999999',
            isWalkIn: true,
            role: 'CLIENT',
          },
        }),
      )
      .mockResolvedValueOnce({ id: 'inv-1', status: 'PAID', items: [], payments: [], client: {} });
    await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), params);
    const [, smsOpts] = mocks.sendSmsRespectful.mock.calls[0];
    expect(smsOpts.recipient).toBe('walkin');
  });

  it('skips the client SMS entirely when sendClientSms=false (UI toggle)', async () => {
    await POST(
      makeReq({ amount: 100, paymentMethod: 'CASH', sendClientSms: false }),
      params,
    );
    expect(mocks.sendSmsRespectful).not.toHaveBeenCalled();
    // But the ADMIN SMS still fires — operator wants real-time ledger.
    expect(mocks.sendSmsNow).toHaveBeenCalledWith(expect.objectContaining({ to: 'ADMIN' }));
  });

  it('always dispatches the admin SMS via sendSmsNow with to=ADMIN', async () => {
    await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), params);
    expect(mocks.sendSmsNow).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ADMIN', message: expect.stringContaining('Paiement') }),
    );
  });

  it('writes an INVOICE_PAID action log', async () => {
    await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), params);
    expect(mocks.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'INVOICE_PAID',
        entityType: 'Invoice',
        entityId: 'inv-1',
      }),
    );
  });

  it('wraps the Payment.create + allocate sequence in withSpan', async () => {
    await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), params);
    expect(mocks.withSpan).toHaveBeenCalledWith(
      'api.payment.create',
      expect.any(Object),
      expect.any(Function),
    );
  });
});
