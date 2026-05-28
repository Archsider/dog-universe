import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  logAction: vi.fn(async () => undefined),
  prisma: {
    invoice: { findUnique: vi.fn(), create: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('@/lib/auth-guards', () => ({ requireRole: mocks.requireRole }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/log', () => ({ logAction: mocks.logAction, LOG_ACTIONS: { INVOICE_DUPLICATED: 'INVOICE_DUPLICATED' } }));

import { POST } from '@/app/api/invoices/[id]/duplicate/route';

const params = { params: Promise.resolve({ id: 'src-1' }) };
const req = () => new Request('http://test/api/invoices/src-1/duplicate', { method: 'POST' });

function sourceInvoice(over: Record<string, unknown> = {}) {
  return {
    id: 'src-1',
    invoiceNumber: 'DU-2026-0040',
    clientId: 'client-1',
    clientDisplayName: 'Louis Dev',
    clientDisplayPhone: '0600',
    clientDisplayEmail: 'l@x.com',
    serviceType: 'BOARDING',
    amount: 840,
    notes: 'x',
    client: { id: 'client-1', role: 'CLIENT' },
    items: [
      { description: 'Pension', quantity: 7, unitPrice: 120, total: 840, category: 'BOARDING', productId: null },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue({ session: { user: { id: 'admin-1', role: 'SUPERADMIN' } } });
  // findUnique serves the source (by id) and the number-collision probe (by invoiceNumber → free).
  mocks.prisma.invoice.findUnique.mockImplementation((arg: { where: { id?: string; invoiceNumber?: string } }) =>
    arg.where.id ? sourceInvoice() : null,
  );
  mocks.prisma.$queryRaw.mockResolvedValue([{ lastSeq: 41 }]);
  mocks.prisma.invoice.create.mockResolvedValue({ id: 'new-1', invoiceNumber: 'DU-2026-0041' });
});

describe('POST /api/invoices/[id]/duplicate', () => {
  it('clones items into a fresh PENDING invoice and returns the new id', async () => {
    const res = await POST(req(), params);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json).toEqual({ id: 'new-1', invoiceNumber: 'DU-2026-0041' });

    const createArg = mocks.prisma.invoice.create.mock.calls[0][0];
    expect(createArg.data.status).toBe('PENDING');
    expect(createArg.data.paidAmount).toBe(0);
    expect(createArg.data.clientId).toBe('client-1');
    expect(createArg.data.invoiceNumber).toBe('DU-2026-0041');
    // No booking re-link (standalone duplicate).
    expect(createArg.data.bookingId).toBeUndefined();
    expect(createArg.data.items.create).toHaveLength(1);
    expect(createArg.data.items.create[0]).toMatchObject({ description: 'Pension', quantity: 7, unitPrice: 120, total: 840 });
    expect(mocks.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'INVOICE_DUPLICATED' }));
  });

  it('404 when the source invoice does not exist', async () => {
    mocks.prisma.invoice.findUnique.mockResolvedValue(null);
    const res = await POST(req(), params);
    expect(res.status).toBe(404);
    expect(mocks.prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('400 when the source has no items', async () => {
    mocks.prisma.invoice.findUnique.mockImplementation((arg: { where: { id?: string } }) =>
      arg.where.id ? sourceInvoice({ items: [] }) : null,
    );
    const res = await POST(req(), params);
    expect(res.status).toBe(400);
    expect(mocks.prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('403 when an ADMIN duplicates a non-CLIENT-owned invoice (cross-role)', async () => {
    mocks.requireRole.mockResolvedValue({ session: { user: { id: 'admin-1', role: 'ADMIN' } } });
    mocks.prisma.invoice.findUnique.mockImplementation((arg: { where: { id?: string } }) =>
      arg.where.id ? sourceInvoice({ client: { id: 'c', role: 'ADMIN' } }) : null,
    );
    const res = await POST(req(), params);
    expect(res.status).toBe(403);
    expect(mocks.prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('passes through requireRole rejection (401/403)', async () => {
    const { NextResponse } = await import('next/server');
    mocks.requireRole.mockResolvedValue({ error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) });
    const res = await POST(req(), params);
    expect(res.status).toBe(401);
  });
});
