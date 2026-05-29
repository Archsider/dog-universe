/**
 * API tests — PATCH /api/invoices/[id]/payments/[paymentId]
 *
 * Corrige la date d'encaissement (date de valeur banque) d'un paiement
 * existant — cas central : reclasser un TPE/virement payé fin de mois mais
 * crédité le mois suivant dans le bon mois de CA (cash-basis, Sémantique B).
 *
 * Surface : cross-role gate, facture annulée, validation date, happy path
 * (update + re-allocation + invalidation cache des DEUX mois + MV refresh + log).
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  paymentFindUnique: vi.fn(),
  paymentUpdate: vi.fn(async () => undefined),
  invoiceFindUnique: vi.fn(),
  allocatePayments: vi.fn(async () => undefined),
  cacheDel: vi.fn(async () => undefined),
  scheduleMVRefresh: vi.fn(async () => undefined),
  logAction: vi.fn(async () => undefined),
}));

vi.mock('@/lib/auth-guards', () => ({ requireRole: mocks.requireRole }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    payment: { findUnique: mocks.paymentFindUnique, update: mocks.paymentUpdate },
    invoice: { findUnique: mocks.invoiceFindUnique },
  },
}));
vi.mock('@/lib/payments', () => ({ allocatePayments: mocks.allocatePayments }));
vi.mock('@/lib/cache', () => ({ cacheDel: mocks.cacheDel }));
vi.mock('@/lib/billing/monthly-revenue', () => ({
  scheduleMVRefreshIfCurrentMonth: mocks.scheduleMVRefresh,
}));
vi.mock('@/lib/log', () => ({
  logAction: mocks.logAction,
  LOG_ACTIONS: { PAYMENT_UPDATED: 'PAYMENT_UPDATED' },
}));

import { PATCH } from '@/app/api/invoices/[id]/payments/[paymentId]/route';

const params = { params: Promise.resolve({ id: 'inv1', paymentId: 'pay1' }) };
function req(body: unknown): Request {
  return new Request('http://test/api/invoices/inv1/payments/pay1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue({ session: { user: { id: 'admin1', role: 'ADMIN' } } });
  // Paid 29 May (May revenue month), to be moved to 1 June.
  mocks.paymentFindUnique.mockResolvedValue({
    id: 'pay1',
    invoiceId: 'inv1',
    paymentDate: new Date('2026-05-29T12:00:00Z'),
    paymentMethod: 'CARD',
  });
  mocks.invoiceFindUnique.mockResolvedValue({
    id: 'inv1',
    invoiceNumber: 'DU-2026-0042',
    status: 'PAID',
    client: { role: 'CLIENT' },
  });
});

describe('PATCH /api/invoices/[id]/payments/[paymentId]', () => {
  it('déplace la date d\'encaissement et invalide le cache des DEUX mois', async () => {
    const res = await PATCH(req({ paymentDate: '2026-06-01' }), params);
    expect(res.status).toBe(200);

    // L'update porte bien la nouvelle date.
    const updateArg = mocks.paymentUpdate.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'pay1' });
    expect(updateArg.data.paymentDate.toISOString().slice(0, 10)).toBe('2026-06-01');

    // Re-allocation déclenchée.
    expect(mocks.allocatePayments).toHaveBeenCalledWith('inv1');

    // Cache revenue invalidé pour mai (source) ET juin (destination).
    const keys = mocks.cacheDel.mock.calls.map((c) => c[0]);
    expect(keys).toContain('revenue:2026:5');
    expect(keys).toContain('revenue:2026:6');

    // MV refresh schedulé pour les deux dates.
    expect(mocks.scheduleMVRefresh).toHaveBeenCalledTimes(2);

    // Audit.
    expect(mocks.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PAYMENT_UPDATED' }),
    );
  });

  it('rejette une date invalide (400)', async () => {
    const res = await PATCH(req({ paymentDate: 'pas-une-date' }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_PAYMENT_DATE');
    expect(mocks.paymentUpdate).not.toHaveBeenCalled();
  });

  it('rejette un body vide (400 INVALID_BODY)', async () => {
    const res = await PATCH(req({}), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_BODY');
  });

  it('refuse ADMIN sur une facture non-CLIENT (403 cross-role)', async () => {
    mocks.invoiceFindUnique.mockResolvedValue({
      id: 'inv1', invoiceNumber: 'X', status: 'PAID', client: { role: 'ADMIN' },
    });
    const res = await PATCH(req({ paymentDate: '2026-06-01' }), params);
    expect(res.status).toBe(403);
    expect(mocks.paymentUpdate).not.toHaveBeenCalled();
  });

  it('refuse sur une facture annulée (400 INVOICE_CANCELLED)', async () => {
    mocks.invoiceFindUnique.mockResolvedValue({
      id: 'inv1', invoiceNumber: 'X', status: 'CANCELLED', client: { role: 'CLIENT' },
    });
    const res = await PATCH(req({ paymentDate: '2026-06-01' }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVOICE_CANCELLED');
  });

  it('404 si le paiement n\'existe pas', async () => {
    mocks.paymentFindUnique.mockResolvedValue(null);
    const res = await PATCH(req({ paymentDate: '2026-06-01' }), params);
    expect(res.status).toBe(404);
  });

  it('403 si le paiement appartient à une autre facture', async () => {
    mocks.paymentFindUnique.mockResolvedValue({
      id: 'pay1', invoiceId: 'autre', paymentDate: new Date(), paymentMethod: 'CARD',
    });
    const res = await PATCH(req({ paymentDate: '2026-06-01' }), params);
    expect(res.status).toBe(403);
  });
});
