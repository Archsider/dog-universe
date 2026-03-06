import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ─────────────────────────────────────────────────
vi.mock('next/server');

// auth is at the project root — 4 levels up from src/app/api/__tests__/
vi.mock('../../../../auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    invoice: {
      findUnique: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
    },
    booking: { count: vi.fn() },
    user: { findUnique: vi.fn() },
    loyaltyGrade: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/log', () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
  LOG_ACTIONS: { INVOICE_PAID: 'INVOICE_PAID' },
}));

vi.mock('@/lib/loyalty', () => ({
  computeGradeFromStats: vi.fn().mockReturnValue('SILVER'),
}));

// ── Imports after mocks ──────────────────────────────────────────
import { GET, PATCH } from '../invoices/[id]/route';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';
import { computeGradeFromStats } from '@/lib/loyalty';

// ── Fixtures ──────────────────────────────────────────────────────
const clientSession = {
  user: { id: 'client-1', email: 'client@example.com', name: 'Alice', role: 'CLIENT' },
};
const adminSession = {
  user: { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'ADMIN' },
};
const superadminSession = {
  user: { id: 'super-1', email: 'super@example.com', name: 'Super', role: 'SUPERADMIN' },
};

const mockInvoice = {
  id: 'inv-1',
  clientId: 'client-1',
  invoiceNumber: 'INV-2025-0001',
  amount: 1200,
  status: 'PENDING',
  paidAt: null,
  paymentMethod: null,
  notes: null,
  client: { id: 'client-1', name: 'Alice', email: 'client@example.com', phone: null },
  booking: null,
  items: [],
};

const params = { params: Promise.resolve({ id: 'inv-1' }) };

// ── Tests ─────────────────────────────────────────────────────────
describe('GET /api/invoices/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(clientSession as never);
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue(mockInvoice as never);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const req = new Request('http://localhost/api/invoices/inv-1');
    const res = await GET(req, params);
    expect(res.status).toBe(401);
  });

  it('returns 404 when invoice does not exist', async () => {
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/invoices/inv-1'), params);
    expect(res.status).toBe(404);
  });

  it('returns 403 when client requests another client\'s invoice', async () => {
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      ...mockInvoice,
      clientId: 'other-client',
    } as never);
    const res = await GET(new Request('http://localhost/api/invoices/inv-1'), params);
    expect(res.status).toBe(403);
  });

  it('returns 200 with invoice data for the owning client', async () => {
    const res = await GET(new Request('http://localhost/api/invoices/inv-1'), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('inv-1');
    expect(body.invoiceNumber).toBe('INV-2025-0001');
  });

  it('returns 200 when admin accesses any invoice', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      ...mockInvoice,
      clientId: 'different-client', // not the admin's ID
    } as never);
    const res = await GET(new Request('http://localhost/api/invoices/inv-1'), params);
    expect(res.status).toBe(200);
  });

  it('returns 200 when superadmin accesses any invoice', async () => {
    vi.mocked(auth).mockResolvedValue(superadminSession as never);
    const res = await GET(new Request('http://localhost/api/invoices/inv-1'), params);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/invoices/[id]', () => {
  function patchRequest(body: Record<string, unknown>) {
    return new Request('http://localhost/api/invoices/inv-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue(mockInvoice as never);
    vi.mocked(prisma.invoice.update).mockResolvedValue({ ...mockInvoice, status: 'PAID' } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'client-1' } as never);
    vi.mocked(prisma.invoice.aggregate).mockResolvedValue({ _sum: { amount: 1200 } } as never);
    vi.mocked(prisma.booking.count).mockResolvedValue(5);
    vi.mocked(prisma.loyaltyGrade.findUnique).mockResolvedValue({
      clientId: 'client-1',
      grade: 'MEMBER',
      isOverride: false,
    } as never);
    vi.mocked(prisma.loyaltyGrade.update).mockResolvedValue({} as never);
  });

  it('returns 403 when client tries to update an invoice', async () => {
    vi.mocked(auth).mockResolvedValue(clientSession as never);
    const res = await PATCH(patchRequest({ status: 'PAID' }), params);
    expect(res.status).toBe(403);
  });

  it('returns 403 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await PATCH(patchRequest({ status: 'PAID' }), params);
    expect(res.status).toBe(403);
  });

  it('returns 404 when invoice does not exist', async () => {
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue(null);
    const res = await PATCH(patchRequest({ status: 'PAID' }), params);
    expect(res.status).toBe(404);
  });

  it('returns 200 when marking invoice as PAID', async () => {
    const res = await PATCH(patchRequest({ status: 'PAID' }), params);
    expect(res.status).toBe(200);
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAID', paidAt: expect.any(Date) }),
      }),
    );
  });

  it('sets paidAt timestamp when status becomes PAID', async () => {
    await PATCH(patchRequest({ status: 'PAID' }), params);
    const call = vi.mocked(prisma.invoice.update).mock.calls[0][0];
    expect(call.data).toHaveProperty('paidAt');
    expect(call.data.paidAt).toBeInstanceOf(Date);
  });

  it('records paymentMethod when provided with PAID status', async () => {
    await PATCH(patchRequest({ status: 'PAID', paymentMethod: 'CASH' }), params);
    const call = vi.mocked(prisma.invoice.update).mock.calls[0][0];
    expect(call.data.paymentMethod).toBe('CASH');
  });

  it('updates notes without setting paidAt', async () => {
    await PATCH(patchRequest({ notes: 'Paid by bank transfer' }), params);
    const call = vi.mocked(prisma.invoice.update).mock.calls[0][0];
    expect(call.data.notes).toBe('Paid by bank transfer');
    expect(call.data).not.toHaveProperty('paidAt');
  });

  it('allows superadmin to update invoices', async () => {
    vi.mocked(auth).mockResolvedValue(superadminSession as never);
    const res = await PATCH(patchRequest({ status: 'PAID' }), params);
    expect(res.status).toBe(200);
  });

  // ── Loyalty grade recalculation ───────────────────────────────
  it('recalculates loyalty grade when invoice is paid', async () => {
    vi.mocked(computeGradeFromStats).mockReturnValue('SILVER');

    await PATCH(patchRequest({ status: 'PAID' }), params);

    expect(computeGradeFromStats).toHaveBeenCalled();
  });

  it('updates loyalty grade when suggested grade differs from current', async () => {
    vi.mocked(prisma.loyaltyGrade.findUnique).mockResolvedValue({
      clientId: 'client-1',
      grade: 'MEMBER',
      isOverride: false,
    } as never);
    vi.mocked(computeGradeFromStats).mockReturnValue('SILVER');

    await PATCH(patchRequest({ status: 'PAID' }), params);

    expect(prisma.loyaltyGrade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ grade: 'SILVER' }),
      }),
    );
  });

  it('does not change grade when isOverride is true', async () => {
    vi.mocked(prisma.loyaltyGrade.findUnique).mockResolvedValue({
      clientId: 'client-1',
      grade: 'PLATINUM',
      isOverride: true, // manually overridden — must not change
    } as never);
    vi.mocked(computeGradeFromStats).mockReturnValue('SILVER');

    await PATCH(patchRequest({ status: 'PAID' }), params);

    expect(prisma.loyaltyGrade.update).not.toHaveBeenCalled();
  });

  it('does not change grade when suggested grade equals current', async () => {
    vi.mocked(prisma.loyaltyGrade.findUnique).mockResolvedValue({
      clientId: 'client-1',
      grade: 'SILVER',
      isOverride: false,
    } as never);
    vi.mocked(computeGradeFromStats).mockReturnValue('SILVER'); // same

    await PATCH(patchRequest({ status: 'PAID' }), params);

    expect(prisma.loyaltyGrade.update).not.toHaveBeenCalled();
  });

  it('does not trigger loyalty logic when not marking as PAID', async () => {
    await PATCH(patchRequest({ notes: 'Some note' }), params);
    expect(computeGradeFromStats).not.toHaveBeenCalled();
    expect(prisma.loyaltyGrade.update).not.toHaveBeenCalled();
  });
});
