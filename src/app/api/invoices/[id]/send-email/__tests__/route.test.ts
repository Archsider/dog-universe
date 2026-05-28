import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  sendEmail: vi.fn(async (_p: { to: string; subject: string; html: string; attachments?: Array<{ filename: string; content: Buffer; contentType?: string }> }) => undefined),
  logAction: vi.fn(async () => undefined),
  generateInvoicePDF: vi.fn(async () => Buffer.from('%PDF-1.4 fake')),
  prisma: { invoice: { findUnique: vi.fn() } },
}));

vi.mock('@/lib/auth-guards', () => ({ requireRole: mocks.requireRole }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/email', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('@/lib/log', () => ({ logAction: mocks.logAction, LOG_ACTIONS: { INVOICE_SENT_EMAIL: 'INVOICE_SENT_EMAIL' } }));
vi.mock('@/lib/pdf', () => ({ generateInvoicePDF: mocks.generateInvoicePDF }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { POST } from '@/app/api/invoices/[id]/send-email/route';

const params = { params: Promise.resolve({ id: 'inv-1' }) };
const req = () => new Request('http://test/api/invoices/inv-1/send-email', { method: 'POST' });

function invoice(over: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    invoiceNumber: 'DU-2026-0042',
    clientDisplayName: null,
    clientDisplayEmail: null,
    amount: 840,
    paidAmount: 0,
    client: { id: 'c1', name: 'Louis Dev', email: 'louis@x.com', language: 'fr', role: 'CLIENT' },
    booking: null,
    items: [{ description: 'Pension', quantity: 7, unitPrice: 120, total: 840, allocatedAmount: 0 }],
    payments: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue({ session: { user: { id: 'admin-1', role: 'SUPERADMIN' } } });
  mocks.prisma.invoice.findUnique.mockResolvedValue(invoice());
});

describe('POST /api/invoices/[id]/send-email', () => {
  it('emails the invoice PDF as an attachment to the client', async () => {
    const res = await POST(req(), params);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, to: 'louis@x.com' });

    expect(mocks.generateInvoicePDF).toHaveBeenCalledTimes(1);
    const emailArg = mocks.sendEmail.mock.calls[0][0];
    expect(emailArg.to).toBe('louis@x.com');
    expect(emailArg.subject).toContain('DU-2026-0042');
    const atts = emailArg.attachments ?? [];
    expect(atts).toHaveLength(1);
    expect(atts[0]).toMatchObject({ filename: 'DU-2026-0042.pdf', contentType: 'application/pdf' });
    expect(Buffer.isBuffer(atts[0].content)).toBe(true);
    expect(mocks.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'INVOICE_SENT_EMAIL' }));
  });

  it('prefers the invoice display email override', async () => {
    mocks.prisma.invoice.findUnique.mockResolvedValue(invoice({ clientDisplayEmail: 'override@x.com' }));
    const res = await POST(req(), params);
    expect((await res.json()).to).toBe('override@x.com');
    expect(mocks.sendEmail.mock.calls[0][0].to).toBe('override@x.com');
  });

  it('404 when the invoice does not exist', async () => {
    mocks.prisma.invoice.findUnique.mockResolvedValue(null);
    const res = await POST(req(), params);
    expect(res.status).toBe(404);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('400 NO_EMAIL when only the walk-in placeholder email exists', async () => {
    mocks.prisma.invoice.findUnique.mockResolvedValue(
      invoice({ client: { id: 'c1', name: 'X', email: 'passage@doguniverse.ma', language: 'fr', role: 'CLIENT' } }),
    );
    const res = await POST(req(), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('NO_EMAIL');
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('403 when an ADMIN targets a non-CLIENT-owned invoice', async () => {
    mocks.requireRole.mockResolvedValue({ session: { user: { id: 'a', role: 'ADMIN' } } });
    mocks.prisma.invoice.findUnique.mockResolvedValue(
      invoice({ client: { id: 'c1', name: 'X', email: 'x@x.com', language: 'fr', role: 'SUPERADMIN' } }),
    );
    const res = await POST(req(), params);
    expect(res.status).toBe(403);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('500 EMAIL_SEND_FAILED when the SMTP send throws', async () => {
    mocks.sendEmail.mockRejectedValueOnce(new Error('smtp down'));
    const res = await POST(req(), params);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('EMAIL_SEND_FAILED');
  });
});
