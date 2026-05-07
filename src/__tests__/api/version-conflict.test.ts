/**
 * API tests — Optimistic lock VERSION_CONFLICT sur PATCH /api/invoices/[id]
 *
 * Note : la version `bookings` est déjà couverte dans
 * `src/__tests__/api/bookings.test.ts` (describe 'Optimistic lock — bookings PATCH').
 * Ce fichier complète avec le pendant côté factures.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    invoice: { findUnique: vi.fn(), update: vi.fn() },
  },
  allocatePayments: vi.fn().mockResolvedValue(undefined),
  logAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/payments', () => ({ allocatePayments: mocks.allocatePayments }));
vi.mock('@/lib/log', () => ({
  logAction: mocks.logAction,
  LOG_ACTIONS: { INVOICE_UPDATED: 'INVOICE_UPDATED', INVOICE_PAID: 'INVOICE_PAID' },
}));

import { PATCH as InvoicePATCH } from '@/app/api/invoices/[id]/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'SUPERADMIN' } });
});

describe('PATCH /api/invoices/[id] — VERSION_CONFLICT', () => {
  it('returns 409 VERSION_CONFLICT when caller sends stale version', async () => {
    mocks.prisma.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-1',
      clientId: 'c1',
      version: 7,
      status: 'PENDING',
      client: { role: 'CLIENT' },
    });

    const req = new Request('http://x/api/invoices/inv-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'PAID', version: 3 }),
    });

    const res = await InvoicePATCH(req, { params: Promise.resolve({ id: 'inv-1' }) });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('VERSION_CONFLICT');
    expect(json.currentVersion).toBe(7);
    // Must short-circuit before any update / allocation
    expect(mocks.prisma.invoice.update).not.toHaveBeenCalled();
    expect(mocks.allocatePayments).not.toHaveBeenCalled();
  });

  it('proceeds when no version is sent (legacy compatibility)', async () => {
    mocks.prisma.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-1',
      clientId: 'c1',
      version: 7,
      status: 'PENDING',
      client: { role: 'CLIENT' },
    });
    mocks.prisma.invoice.update.mockResolvedValue({ id: 'inv-1', status: 'PAID' });

    const req = new Request('http://x/api/invoices/inv-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'PAID' }),
    });

    const res = await InvoicePATCH(req, { params: Promise.resolve({ id: 'inv-1' }) });
    // Whatever the success status (200/204), it must NOT be 409
    expect(res.status).not.toBe(409);
  });
});
