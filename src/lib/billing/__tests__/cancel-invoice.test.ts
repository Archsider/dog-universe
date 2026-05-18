/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Invoice = Record<string, any>;
type BookingItem = Record<string, any>;
const state: { invoices: Invoice[]; bookingItems: BookingItem[] } = {
  invoices: [],
  bookingItems: [],
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    invoice: {
      findUnique: async ({ where }: any) => state.invoices.find((i) => i.id === where.id) ?? null,
      updateMany: async ({ where, data }: any) => {
        let n = 0;
        for (const i of state.invoices) {
          if (i.id !== where.id) continue;
          if (where.version != null && i.version !== where.version) continue;
          Object.assign(i, data);
          n++;
        }
        return { count: n };
      },
    },
    bookingItem: {
      updateMany: async ({ where, data }: any) => {
        let n = 0;
        const ids: string[] = where.invoiceItemId?.in ?? [];
        for (const bi of state.bookingItems) {
          if (ids.includes(bi.invoiceItemId)) {
            Object.assign(bi, data);
            n++;
          }
        }
        return { count: n };
      },
    },
    $transaction: async (cb: (tx: any) => any) => {
      return cb({
        invoice: {
          updateMany: async (args: any) => {
            let n = 0;
            for (const i of state.invoices) {
              if (i.id !== args.where.id) continue;
              if (args.where.version != null && i.version !== args.where.version) continue;
              Object.assign(i, args.data);
              n++;
            }
            return { count: n };
          },
        },
        bookingItem: {
          updateMany: async (args: any) => {
            let n = 0;
            const ids: string[] = args.where.invoiceItemId?.in ?? [];
            for (const bi of state.bookingItems) {
              if (ids.includes(bi.invoiceItemId)) {
                Object.assign(bi, args.data);
                n++;
              }
            }
            return { count: n };
          },
        },
      });
    },
  },
}));

// recordPayment mock is reassignable per test so we can exercise both the
// happy refund path AND the REFUND_FAILED branch when the underlying
// negative-payment insertion fails. vi.hoisted gives us a reference that
// the mock factory (also hoisted) can capture safely.
const { recordPaymentMock } = vi.hoisted(() => ({
  recordPaymentMock: vi.fn(),
}));
vi.mock('@/lib/payment-allocation', () => ({
  recordPayment: recordPaymentMock,
}));

beforeEach(() => {
  recordPaymentMock.mockReset();
  recordPaymentMock.mockResolvedValue({ ok: true, paymentId: 'pay_refund_1' });
  state.invoices = [
    {
      id: 'inv_pending',
      invoiceNumber: 'DU-2026-0052',
      status: 'PENDING',
      amount: 740,
      paidAmount: 0,
      clientId: 'c1',
      version: 0,
      notes: null,
      client: { role: 'CLIENT' },
      items: [{ id: 'ii_1' }, { id: 'ii_2' }],
    },
    {
      id: 'inv_paid',
      invoiceNumber: 'DU-2026-0040',
      status: 'PAID',
      amount: 2480,
      paidAmount: 2480,
      clientId: 'c1',
      version: 1,
      notes: null,
      client: { role: 'CLIENT' },
      items: [{ id: 'ii_3' }],
    },
    {
      id: 'inv_already_cancelled',
      invoiceNumber: 'DU-2026-0033',
      status: 'CANCELLED',
      amount: 100,
      paidAmount: 0,
      clientId: 'c1',
      version: 0,
      notes: null,
      client: { role: 'CLIENT' },
      items: [],
    },
    {
      id: 'inv_superadmin_owned',
      invoiceNumber: 'DU-2026-0099',
      status: 'PENDING',
      amount: 500,
      paidAmount: 0,
      clientId: 'super1',
      version: 0,
      notes: null,
      client: { role: 'SUPERADMIN' },
      items: [],
    },
  ];
  state.bookingItems = [
    { id: 'bi_1', invoiceItemId: 'ii_1' },
    { id: 'bi_2', invoiceItemId: 'ii_2' },
    { id: 'bi_3', invoiceItemId: 'ii_3' },
  ];
});

async function lib() { return import('../cancel-invoice'); }

describe('cancelInvoice — state machine + cascade', () => {
  it('happy path : PENDING → CANCELLED with cascade unlink', async () => {
    const { cancelInvoice } = await lib();
    const r = await cancelInvoice({
      invoiceId: 'inv_pending',
      reason: 'doublon avec la facture principale',
      actorId: 'admin1',
      actorRole: 'ADMIN',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.previousStatus).toBe('PENDING');
      expect(r.invoiceNumber).toBe('DU-2026-0052');
      expect(r.bookingItemsUnlinked).toBe(2);
    }
    const inv = state.invoices.find((i) => i.id === 'inv_pending')!;
    expect(inv.status).toBe('CANCELLED');
    expect(inv.notes).toMatch(/doublon avec la facture principale/);
    expect(inv.version).toBe(1);
    // BookingItems are unlinked.
    expect(state.bookingItems.filter((bi) => bi.invoiceItemId === null)).toHaveLength(2);
  });

  it('refuses too-short reason', async () => {
    const { cancelInvoice } = await lib();
    const r = await cancelInvoice({
      invoiceId: 'inv_pending',
      reason: 'short',
      actorId: 'admin1',
      actorRole: 'ADMIN',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_REASON');
    expect(state.invoices.find((i) => i.id === 'inv_pending')!.status).toBe('PENDING');
  });

  it('refuses missing invoice', async () => {
    const { cancelInvoice } = await lib();
    const r = await cancelInvoice({
      invoiceId: 'nope',
      reason: 'pretty long reason ok',
      actorId: 'admin1',
      actorRole: 'ADMIN',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVOICE_NOT_FOUND');
  });

  it('refuses already-cancelled invoice (idempotency guard)', async () => {
    const { cancelInvoice } = await lib();
    const r = await cancelInvoice({
      invoiceId: 'inv_already_cancelled',
      reason: 'retry sorry already done',
      actorId: 'admin1',
      actorRole: 'ADMIN',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('ALREADY_CANCELLED');
  });

  it('refuses PAID invoice without refundExisting opt-in', async () => {
    const { cancelInvoice } = await lib();
    const r = await cancelInvoice({
      invoiceId: 'inv_paid',
      reason: 'admin needs to cancel a paid invoice',
      actorId: 'admin1',
      actorRole: 'ADMIN',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('PAID_INVOICE_REQUIRES_REFUND');
      expect(r.detail?.paidAmount).toBe(2480);
    }
    expect(state.invoices.find((i) => i.id === 'inv_paid')!.status).toBe('PAID');
  });

  it('PAID cancel with refundExisting: records a NEGATIVE Payment via recordPayment', async () => {
    const { cancelInvoice } = await lib();
    const r = await cancelInvoice({
      invoiceId: 'inv_paid',
      reason: 'duplicate billing — refund authorized',
      actorId: 'admin1',
      actorRole: 'ADMIN',
      refundExisting: true,
      paymentMethodForRefund: 'CASH',
    });

    expect(r.ok).toBe(true);
    expect(state.invoices.find((i) => i.id === 'inv_paid')!.status).toBe('CANCELLED');

    // The refund Payment MUST have been recorded through the canonical
    // helper (no direct prisma.payment.create bypass) with:
    //   - negative amount equal to the original paidAmount
    //   - the operator's chosen payment method
    //   - allowNegative: true (the only flag that unlocks negative amounts +
    //     CANCELLED-status acceptance in recordPayment)
    expect(recordPaymentMock).toHaveBeenCalledTimes(1);
    const [paymentInput, paymentOptions] = recordPaymentMock.mock.calls[0];
    expect(paymentInput.invoiceId).toBe('inv_paid');
    expect(paymentInput.amount).toBe(-2480);
    expect(paymentInput.paymentMethod).toBe('CASH');
    expect(paymentInput.paymentDate).toBeInstanceOf(Date);
    expect(paymentInput.notes).toMatch(/refund/i);
    expect(paymentInput.notes).toMatch(/DU-2026-0040/);
    expect(paymentOptions).toEqual({ allowNegative: true });

    if (r.ok) {
      expect(r.refundPaymentId).toBe('pay_refund_1');
      expect(r.bookingItemsUnlinked).toBe(1);
    }
  });

  it('PAID cancel + refundExisting with TRANSFER method propagates the method choice', async () => {
    const { cancelInvoice } = await lib();
    await cancelInvoice({
      invoiceId: 'inv_paid',
      reason: 'duplicate billing — refunded by bank transfer',
      actorId: 'admin1',
      actorRole: 'ADMIN',
      refundExisting: true,
      paymentMethodForRefund: 'TRANSFER',
    });
    expect(recordPaymentMock.mock.calls[0][0].paymentMethod).toBe('TRANSFER');
  });

  it('PENDING cancel (no payments): does NOT call recordPayment', async () => {
    const { cancelInvoice } = await lib();
    await cancelInvoice({
      invoiceId: 'inv_pending',
      reason: 'unpaid duplicate to drop',
      actorId: 'admin1',
      actorRole: 'ADMIN',
    });
    // No paidAmount means nothing to refund — recordPayment must NOT fire,
    // otherwise we would insert a Payment with amount 0 (which the helper
    // rejects, but also semantically wrong).
    expect(recordPaymentMock).not.toHaveBeenCalled();
  });

  it('refund failure returns REFUND_FAILED with diagnostic detail', async () => {
    recordPaymentMock.mockResolvedValueOnce({
      ok: false,
      error: 'INVALID_PAYMENT_METHOD',
      detail: { reason: 'simulated downstream failure' },
    });
    const { cancelInvoice } = await lib();
    const r = await cancelInvoice({
      invoiceId: 'inv_paid',
      reason: 'duplicate billing — refund attempted',
      actorId: 'admin1',
      actorRole: 'ADMIN',
      refundExisting: true,
      paymentMethodForRefund: 'CASH',
    });

    // The cancel itself committed (status flipped + items unlinked) BEFORE
    // the post-commit refund step; the caller is told REFUND_FAILED so the
    // operator can record the negative Payment manually later.
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('REFUND_FAILED');
      expect(r.detail?.invoiceNumber).toBe('DU-2026-0040');
      expect(r.detail?.recordPaymentError).toBe('INVALID_PAYMENT_METHOD');
      expect(r.detail?.previousStatus).toBe('PAID');
      expect(r.detail?.bookingItemsUnlinked).toBe(1);
    }
    // Invoice was already flipped to CANCELLED before the refund attempt.
    expect(state.invoices.find((i) => i.id === 'inv_paid')!.status).toBe('CANCELLED');
  });

  it('ADMIN cross-role : refuses to cancel a SUPERADMIN-owned invoice', async () => {
    const { cancelInvoice } = await lib();
    const r = await cancelInvoice({
      invoiceId: 'inv_superadmin_owned',
      reason: 'forbidden attempt by junior admin',
      actorId: 'admin1',
      actorRole: 'ADMIN',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('CROSS_ROLE_FORBIDDEN');
    expect(state.invoices.find((i) => i.id === 'inv_superadmin_owned')!.status).toBe('PENDING');
  });

  it('SUPERADMIN can cancel SUPERADMIN-owned invoices', async () => {
    const { cancelInvoice } = await lib();
    const r = await cancelInvoice({
      invoiceId: 'inv_superadmin_owned',
      reason: 'legitimate superadmin cancel',
      actorId: 'super1',
      actorRole: 'SUPERADMIN',
    });
    expect(r.ok).toBe(true);
  });

  it('appends a dated note in French — preserves existing notes', async () => {
    state.invoices[0].notes = 'Note précédente';
    const { cancelInvoice } = await lib();
    await cancelInvoice({
      invoiceId: 'inv_pending',
      reason: 'doublon facture supplémentaire 740 MAD',
      actorId: 'admin1',
      actorRole: 'ADMIN',
    });
    const inv = state.invoices.find((i) => i.id === 'inv_pending')!;
    expect(inv.notes).toMatch(/Note précédente/);
    expect(inv.notes).toMatch(/\[Annulée.*par ADMIN\] doublon facture supplémentaire/);
  });
});

describe('getSupplementLabel — dynamic by item categories', () => {
  it('PRODUCT-only → "Facture produits supplémentaires"', async () => {
    const { getSupplementLabel } = await lib();
    expect(getSupplementLabel([{ category: 'PRODUCT' }])).toBe('Facture produits supplémentaires');
    expect(getSupplementLabel([{ category: 'PRODUCT' }], 'en')).toBe('Additional products invoice');
  });

  it('BOARDING-only → "Supplément prolongation"', async () => {
    const { getSupplementLabel } = await lib();
    expect(getSupplementLabel([{ category: 'BOARDING' }])).toBe('Supplément prolongation');
    expect(getSupplementLabel([{ category: 'BOARDING' }], 'en')).toBe('Extension surcharge');
  });

  it('GROOMING-only → "Facture toilettage supplémentaire"', async () => {
    const { getSupplementLabel } = await lib();
    expect(getSupplementLabel([{ category: 'GROOMING' }])).toBe('Facture toilettage supplémentaire');
  });

  it('mixed categories → generic "Facture supplémentaire"', async () => {
    const { getSupplementLabel } = await lib();
    expect(getSupplementLabel([
      { category: 'BOARDING' },
      { category: 'PRODUCT' },
    ])).toBe('Facture supplémentaire');
  });

  it('empty items → generic label (defensive)', async () => {
    const { getSupplementLabel } = await lib();
    expect(getSupplementLabel([])).toBe('Facture supplémentaire');
  });
});
