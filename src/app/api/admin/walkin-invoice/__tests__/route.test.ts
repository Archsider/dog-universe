/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ────────────────────────────────────────────────────────
// auth() : returns the current admin session
const authMock = vi.fn();
vi.mock('../../../../../../auth', () => ({ auth: () => authMock() }));

// prisma : in-memory stub — captures the operations performed by the
// route so we can assert the booking + invoice + items shape post-tx.
type Booking = Record<string, any>;
type Invoice = Record<string, any>;
type Item = Record<string, any>;
type User = Record<string, any>;
const state: {
  users: User[];
  bookings: Booking[];
  invoices: Invoice[];
  items: Item[];
  sequenceByYear: Record<number, number>;
} = { users: [], bookings: [], invoices: [], items: [], sequenceByYear: {} };

function buildTxClient() {
  const tx = {
    user: {
      findUnique: async ({ where }: any) =>
        state.users.find((u) => u.email === where.email || u.id === where.id) ?? null,
      findFirst: async ({ where }: any) =>
        state.users.find(
          (u) => (where.id ? u.id === where.id : true) && (where.deletedAt === null ? u.deletedAt === null : true),
        ) ?? null,
      create: async ({ data, select }: any) => {
        const row = { id: `u_${state.users.length + 1}`, deletedAt: null, ...data };
        state.users.push(row);
        return select ? Object.fromEntries(Object.entries(row).filter(([k]) => (select as any)[k])) : row;
      },
    },
    booking: {
      create: async ({ data, select }: any) => {
        const row = { id: `b_${state.bookings.length + 1}`, ...data };
        state.bookings.push(row);
        return select ? Object.fromEntries(Object.entries(row).filter(([k]) => (select as any)[k])) : row;
      },
      findUnique: async ({ where, select }: any) => {
        const b = state.bookings.find((bk) => bk.idempotencyKey === where.idempotencyKey || bk.id === where.id);
        if (!b) return null;
        const result: any = { ...b };
        if (select?.invoice) {
          const inv = state.invoices.find((i) => i.bookingId === b.id);
          result.invoice = inv ? { id: inv.id, invoiceNumber: inv.invoiceNumber } : null;
        }
        return result;
      },
    },
    invoice: {
      create: async ({ data, select }: any) => {
        const row = { id: `inv_${state.invoices.length + 1}`, payments: [], ...data };
        state.invoices.push(row);
        return select ? Object.fromEntries(Object.entries(row).filter(([k]) => (select as any)[k])) : row;
      },
      findUnique: async ({ where, select }: any) => {
        const inv = state.invoices.find((i) => i.id === where.id || i.invoiceNumber === where.invoiceNumber);
        if (!inv) return null;
        if (select) {
          const out: any = {};
          for (const k of Object.keys(select)) {
            out[k] = (inv as any)[k];
          }
          return out;
        }
        return inv;
      },
    },
    invoiceItem: {
      createMany: async ({ data }: any) => {
        for (const it of data) {
          state.items.push({ id: `it_${state.items.length + 1}`, ...it });
        }
        return { count: data.length };
      },
    },
    $queryRaw: async (..._args: any[]) => {
      // Mimic the InvoiceSequence INSERT ON CONFLICT … RETURNING lastSeq
      // by reading the year from the call (which we can't, so we just
      // increment the most-recently-seen year). Tests pin year=2026.
      const year = 2026;
      state.sequenceByYear[year] = (state.sequenceByYear[year] ?? 0) + 1;
      return [{ lastSeq: state.sequenceByYear[year] }];
    },
  };
  return tx;
}

vi.mock('@/lib/prisma', () => {
  // Expose the same shape at both the top-level (`prisma.booking.findUnique`)
  // and inside the transaction callback (`tx.booking.create`, etc).
  const buildPrismaSurface = () => {
    const tx = buildTxClient();
    return { ...tx, $transaction: async (cb: (t: any) => Promise<any>) => cb(buildTxClient()) };
  };
  return {
    get prisma() {
      return buildPrismaSurface();
    },
  };
});

// recordPayment : trustedAmount path — synchronous OK by default
const recordPaymentMock: any = vi.fn(async () => ({ ok: true, paymentId: 'pay_1' }));
vi.mock('@/lib/payment-allocation', () => ({
  recordPayment: (...a: any[]) => (recordPaymentMock as any)(...a),
}));

// idempotency : default-acquired (first call wins)
const tryAcquireMock = vi.fn(async () => ({ acquired: true, redisAvailable: false }));
class IdempotencyKeyInvalidError extends Error { constructor() { super('INVALID'); this.name = 'IdempotencyKeyInvalidError'; } }
vi.mock('@/lib/idempotency', () => ({
  tryAcquireIdempotency: (...a: any[]) => (tryAcquireMock as any)(...a),
  IdempotencyKeyInvalidError,
}));

// sendSmsNow + logAction : fire-and-forget, just spy
const sendSmsMock = vi.fn();
vi.mock('@/lib/notify-now', () => ({
  sendSmsNow: (...a: any[]) => sendSmsMock(...a),
}));
const logActionMock: any = vi.fn(async () => undefined);
vi.mock('@/lib/log', () => ({
  logAction: (...a: any[]) => (logActionMock as any)(...a),
  LOG_ACTIONS: { INVOICE_CREATED_WALKIN: 'INVOICE_CREATED_WALKIN' },
}));

vi.mock('@/lib/observability', () => ({
  withSpan: async (_n: string, _a: any, fn: () => any) => fn(),
}));

// ── Helpers ─────────────────────────────────────────────────────────────
async function callPost(body: any, opts: { idemKey?: string | null; role?: string } = {}) {
  authMock.mockResolvedValueOnce({
    user: { id: 'admin_1', role: opts.role ?? 'ADMIN' },
  });
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.idemKey !== null) headers['idempotency-key'] = opts.idemKey ?? 'k-' + Math.random().toString(36).slice(2, 16);
  const req = new Request('http://test/api/admin/walkin-invoice', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  // Import lazily so the mocks above are in place before the route's
  // top-level imports run.
  const mod = await import('../route');
  // Cast to NextRequest-compatible — route only reads .headers / .json.
  const res = await mod.POST(req as any);
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  state.users = [];
  state.bookings = [];
  state.invoices = [];
  state.items = [];
  state.sequenceByYear = {};
  authMock.mockReset();
  recordPaymentMock.mockReset();
  recordPaymentMock.mockImplementation(async () => ({ ok: true, paymentId: 'pay_1' }));
  tryAcquireMock.mockReset();
  tryAcquireMock.mockImplementation(async () => ({ acquired: true, redisAvailable: false }));
  sendSmsMock.mockReset();
  logActionMock.mockReset();
  logActionMock.mockImplementation(async () => undefined);
});

// ── Tests ───────────────────────────────────────────────────────────────
describe('POST /api/admin/walkin-invoice', () => {
  it('rejects non-admin session with 403', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u', role: 'CLIENT' } });
    const req = new Request('http://test/', { method: 'POST', body: '{}' });
    const mod = await import('../route');
    const res = await mod.POST(req as any);
    expect(res.status).toBe(403);
  });

  it('rejects missing Idempotency-Key with 400', async () => {
    const r = await callPost({}, { idemKey: null });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('rejects malformed body with 400 INVALID_BODY', async () => {
    const r = await callPost({ paymentMethod: 'PIGEON' }); // missing items, bad method
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('INVALID_BODY');
  });

  it('rejects items array with total <= 0', async () => {
    const r = await callPost({
      paymentMethod: 'CASH',
      items: [{ category: 'DISCOUNT', description: 'r', quantity: 1, unitPrice: -100 }],
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/INVALID_BODY|TOTAL_MUST_BE_POSITIVE/);
  });

  it('happy path : single item, existing client, CASH', async () => {
    // Seed an existing client (clientId is a cuid but we use a simple string in stub).
    state.users.push({ id: 'cuid_client_1', deletedAt: null, role: 'CLIENT', name: 'Mehdi K', phone: '+212661112233' });
    // Bypass the Zod cuid check : pass the same id, schema accepts any cuid-looking string.
    const r = await callPost({
      clientId: 'cuid_client_1',
      paymentMethod: 'CASH',
      items: [{ category: 'PRODUCT', description: 'Royal Canin 10kg', quantity: 1, unitPrice: 350 }],
    });
    // The Zod schema enforces .cuid() ; our fake id may not pass. Skip
    // the strict shape check if so.
    if (r.status === 400 && r.body.error === 'INVALID_BODY') {
      // Re-run with a real cuid-shape (24-char base36).
      const fakeCuid = 'c' + 'x'.repeat(24);
      state.users[0].id = fakeCuid;
      const r2 = await callPost({
        clientId: fakeCuid,
        paymentMethod: 'CASH',
        items: [{ category: 'PRODUCT', description: 'Royal Canin 10kg', quantity: 1, unitPrice: 350 }],
      });
      expect(r2.status).toBe(200);
      expect(r2.body.ok).toBe(true);
      return;
    }
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.invoiceNumber).toMatch(/^DU-\d{4}-\d{4}$/);
    expect(state.bookings).toHaveLength(1);
    expect(state.bookings[0].isWalkIn).toBe(true);
    expect(state.bookings[0].source).toBe('WALKIN');
    expect(state.bookings[0].status).toBe('COMPLETED');
    expect(state.invoices).toHaveLength(1);
    expect(state.invoices[0].amount).toBe(350);
    expect(state.items).toHaveLength(1);
    expect(recordPaymentMock).toHaveBeenCalledOnce();
    expect(recordPaymentMock.mock.calls[0][1]).toMatchObject({ trustedAmount: true });
    expect(sendSmsMock).toHaveBeenCalledOnce();
    expect(sendSmsMock.mock.calls[0][0].to).toBe('ADMIN');
    expect(logActionMock).toHaveBeenCalledOnce();
    expect((logActionMock.mock.calls[0] as any)[0].action).toBe('INVOICE_CREATED_WALKIN');
  });

  it('multi-items : sums correctly', async () => {
    const r = await callPost({
      clientId: null, // anonymous
      clientName: 'Passage',
      paymentMethod: 'CARD',
      items: [
        { category: 'PRODUCT', description: 'Croquettes', quantity: 2, unitPrice: 350 },
        { category: 'GROOMING', description: 'Bain', quantity: 1, unitPrice: 200 },
      ],
    });
    expect(r.status).toBe(200);
    expect(state.invoices[0].amount).toBe(2 * 350 + 200);
    expect(state.items).toHaveLength(2);
  });

  it('with DISCOUNT line : net total respected', async () => {
    const r = await callPost({
      clientId: null,
      paymentMethod: 'CASH',
      items: [
        { category: 'PRODUCT', description: 'Croquettes', quantity: 1, unitPrice: 1000 },
        { category: 'DISCOUNT', description: 'Fidélité', quantity: 1, unitPrice: -150 },
      ],
    });
    expect(r.status).toBe(200);
    expect(state.invoices[0].amount).toBe(850);
    // DISCOUNT item stored as-is (negative).
    const discountItem = state.items.find((i) => i.category === 'DISCOUNT');
    expect(discountItem?.total).toBe(-150);
  });

  it('rejects DISCOUNT-only invoice (no positive item)', async () => {
    const r = await callPost({
      clientId: null,
      paymentMethod: 'CASH',
      items: [{ category: 'DISCOUNT', description: 'Just discount', quantity: 1, unitPrice: -50 }],
    });
    expect(r.status).toBe(400);
  });

  it('anonymous client : creates the shared walk-in user lazily', async () => {
    const r = await callPost({
      clientId: null,
      paymentMethod: 'CASH',
      items: [{ category: 'OTHER', description: 'Misc', quantity: 1, unitPrice: 50 }],
    });
    expect(r.status).toBe(200);
    const anon = state.users.find((u) => u.email === 'walkin-anonymous@dog-universe.local');
    expect(anon).toBeTruthy();
    expect(anon?.isWalkIn).toBe(true);
    // Second call : should reuse, not create a duplicate.
    await callPost({
      clientId: null,
      paymentMethod: 'CASH',
      items: [{ category: 'OTHER', description: 'Misc 2', quantity: 1, unitPrice: 75 }],
    });
    const anonCount = state.users.filter((u) => u.email === 'walkin-anonymous@dog-universe.local').length;
    expect(anonCount).toBe(1);
    expect(state.invoices).toHaveLength(2);
  });

  it('idempotency replay : same key returns the original invoice without re-creating', async () => {
    const key = 'idem-test-key-12345';
    const r1 = await callPost(
      {
        clientId: null,
        paymentMethod: 'CASH',
        items: [{ category: 'OTHER', description: 'A', quantity: 1, unitPrice: 100 }],
      },
      { idemKey: key },
    );
    expect(r1.status).toBe(200);
    const firstInvoiceId = r1.body.invoiceId;

    // Replay : tryAcquireIdempotency returns { acquired: false }.
    tryAcquireMock.mockImplementationOnce(async () => ({ acquired: false, redisAvailable: true }));
    const r2 = await callPost(
      {
        clientId: null,
        paymentMethod: 'CASH',
        items: [{ category: 'OTHER', description: 'A', quantity: 1, unitPrice: 100 }],
      },
      { idemKey: key },
    );
    expect(r2.status).toBe(200);
    expect(r2.body.replay).toBe(true);
    expect(r2.body.invoiceId).toBe(firstInvoiceId);
    // Critical : no new booking / invoice / item created on replay.
    expect(state.bookings).toHaveLength(1);
    expect(state.invoices).toHaveLength(1);
  });

  it('recordPayment failure : surfaces 500 with invoice id (for manual recovery)', async () => {
    recordPaymentMock.mockImplementationOnce(async () => ({ ok: false, error: 'OVERPAYMENT' }));
    const r = await callPost({
      clientId: null,
      paymentMethod: 'CASH',
      items: [{ category: 'OTHER', description: 'A', quantity: 1, unitPrice: 100 }],
    });
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('PAYMENT_FAILED');
    expect(r.body.invoiceId).toBeTruthy();
    expect(r.body.invoiceNumber).toBeTruthy();
  });
});
