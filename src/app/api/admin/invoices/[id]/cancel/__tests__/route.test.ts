/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
vi.mock('../../../../../../../../auth', () => ({ auth: () => authMock() }));

const cancelInvoiceMock = vi.fn();
vi.mock('@/lib/billing/cancel-invoice', () => ({
  cancelInvoice: (args: any) => cancelInvoiceMock(args),
}));

const findUniqueMock = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: {
    invoice: {
      findUnique: (args: any) => findUniqueMock(args),
    },
  },
}));

vi.mock('@/lib/observability', () => ({
  withSpan: async (_n: string, _a: any, fn: () => any) => fn(),
}));

const logActionMock: any = vi.fn(async () => undefined);
vi.mock('@/lib/log', () => ({
  logAction: (...a: any[]) => (logActionMock as any)(...a),
  LOG_ACTIONS: { INVOICE_CANCELLED: 'INVOICE_CANCELLED' },
}));

const notifMock: any = vi.fn(async () => undefined);
vi.mock('@/lib/notifications', () => ({
  createInvoiceCancelledNotification: (...a: any[]) => (notifMock as any)(...a),
}));

beforeEach(() => {
  authMock.mockReset();
  authMock.mockReturnValue({ user: { id: 'admin1', role: 'ADMIN' } });
  cancelInvoiceMock.mockReset();
  findUniqueMock.mockReset();
  findUniqueMock.mockResolvedValue({ clientId: 'c1', amount: 740, paidAmount: 0 });
  logActionMock.mockReset();
  notifMock.mockReset();
});

async function call(body: any) {
  const req = new Request('http://test/', { method: 'POST', body: JSON.stringify(body) });
  const mod = await import('../route');
  const res = await mod.POST(req as any, { params: Promise.resolve({ id: 'inv1' }) });
  return { status: res.status, body: await res.json() };
}

describe('POST /api/admin/invoices/[id]/cancel', () => {
  it('rejects non-admin (403)', async () => {
    authMock.mockReturnValueOnce({ user: { id: 'c', role: 'CLIENT' } });
    const r = await call({ reason: 'attempt by a regular client' });
    expect(r.status).toBe(403);
  });

  it('rejects malformed body (too-short reason)', async () => {
    const r = await call({ reason: 'oops' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('INVALID_BODY');
  });

  it('happy path : returns 200 with cancellation summary + writes audit + notifies', async () => {
    cancelInvoiceMock.mockResolvedValueOnce({
      ok: true,
      invoiceId: 'inv1',
      invoiceNumber: 'DU-2026-0052',
      previousStatus: 'PENDING',
      bookingItemsUnlinked: 2,
      refundPaymentId: null,
    });
    const r = await call({ reason: 'doublon avec la facture principale' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      ok: true,
      invoiceNumber: 'DU-2026-0052',
      previousStatus: 'PENDING',
      bookingItemsUnlinked: 2,
    });
    expect(logActionMock).toHaveBeenCalledOnce();
    expect(notifMock).toHaveBeenCalledOnce();
  });

  it('silent=true skips client notification', async () => {
    cancelInvoiceMock.mockResolvedValueOnce({
      ok: true, invoiceId: 'inv1', invoiceNumber: 'DU-2026-0052',
      previousStatus: 'PENDING', bookingItemsUnlinked: 0, refundPaymentId: null,
    });
    const r = await call({ reason: 'silent cleanup task ok', silent: true });
    expect(r.status).toBe(200);
    expect(notifMock).not.toHaveBeenCalled();
    expect(logActionMock).toHaveBeenCalledOnce(); // audit always written
  });

  it('maps service errors to correct HTTP statuses', async () => {
    cancelInvoiceMock.mockResolvedValueOnce({ ok: false, error: 'INVOICE_NOT_FOUND' });
    let r = await call({ reason: 'invoice does not exist anymore' });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('INVOICE_NOT_FOUND');

    cancelInvoiceMock.mockResolvedValueOnce({ ok: false, error: 'ALREADY_CANCELLED' });
    r = await call({ reason: 'retry already done by another admin' });
    expect(r.status).toBe(409);

    cancelInvoiceMock.mockResolvedValueOnce({ ok: false, error: 'CROSS_ROLE_FORBIDDEN' });
    r = await call({ reason: 'admin tries on superadmin owned' });
    expect(r.status).toBe(403);

    cancelInvoiceMock.mockResolvedValueOnce({
      ok: false, error: 'PAID_INVOICE_REQUIRES_REFUND', detail: { paidAmount: 2480 },
    });
    r = await call({ reason: 'paid invoice no refund opt-in' });
    expect(r.status).toBe(400);
    expect(r.body.detail).toMatchObject({ paidAmount: 2480 });
  });

  it('forwards refundExisting + paymentMethodForRefund to service', async () => {
    cancelInvoiceMock.mockResolvedValueOnce({
      ok: true, invoiceId: 'inv1', invoiceNumber: 'DU-2026-0042',
      previousStatus: 'PAID', bookingItemsUnlinked: 1, refundPaymentId: null,
    });
    const r = await call({
      reason: 'paid invoice canceled with cash refund',
      refundExisting: true,
      paymentMethodForRefund: 'CASH',
    });
    expect(r.status).toBe(200);
    expect(cancelInvoiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        refundExisting: true,
        paymentMethodForRefund: 'CASH',
      }),
    );
  });
});
