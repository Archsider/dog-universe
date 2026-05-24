import { describe, it, expect, vi } from 'vitest';

// editDates only touches prisma INSIDE its $transaction, which runs AFTER the
// guard under test. For the guard-throw path no DB call is made, so a bare
// prisma mock is enough to let the module import.
vi.mock('@/lib/prisma', () => ({
  prisma: { $transaction: vi.fn(), booking: {}, invoice: {}, invoiceItem: {} },
}));
vi.mock('@/lib/log', () => ({ logAction: vi.fn(), LOG_ACTIONS: {} }));

import { editDates } from '@/lib/services/booking-admin/edit-dates';
import { BookingError } from '@/lib/services/booking-errors';

type EditDatesArg = Parameters<typeof editDates>[0];

function makeArgs(invoice: { status: string; paidAmount: number } | null): EditDatesArg {
  return {
    booking: {
      id: 'b1',
      serviceType: 'PET_TAXI', // skips BOARDING pricing import; newTotal = totalPrice
      totalPrice: 300,
      startDate: new Date('2026-06-01T12:00:00Z'),
      endDate: new Date('2026-06-03T12:00:00Z'),
      arrivalTime: null,
      bookingPets: [],
      boardingDetail: null,
      invoice: invoice ? { id: 'inv1', amount: 600, ...invoice } : null,
    } as unknown as EditDatesArg['booking'],
    newStartStr: '2026-06-10',
    newEndStr: '2026-06-12',
    forcePaidInvoice: false,
    actorId: 'admin1',
  };
}

describe('editDates — shorten-below-paid guard', () => {
  it('refuses (409) when the new total is below paidAmount on a PARTIALLY_PAID invoice', async () => {
    // newTotal (300) < paidAmount (500) → must throw instead of breaching the
    // DB CHECK (paidAmount <= amount + 0.01) with a raw 500.
    await expect(
      editDates(makeArgs({ status: 'PARTIALLY_PAID', paidAmount: 500 })),
    ).rejects.toMatchObject({
      code: 'CANNOT_SHORTEN_BELOW_PAID',
      status: 409,
    });
  });

  it('throws a BookingError instance carrying the offending amounts', async () => {
    try {
      await editDates(makeArgs({ status: 'PARTIALLY_PAID', paidAmount: 500 }));
      throw new Error('expected editDates to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BookingError);
      const be = err as BookingError;
      expect(be.code).toBe('CANNOT_SHORTEN_BELOW_PAID');
      expect(be.payload).toMatchObject({ newTotal: 300, paidAmount: 500 });
    }
  });

  it('does NOT trip the guard when paidAmount is within the new total (boundary)', async () => {
    // paidAmount (300) == newTotal (300): guard must NOT fire. The call then
    // proceeds past the guard into validateTaxiSlot / the tx — we only assert
    // the error, if any, is NOT our guard code.
    await expect(
      editDates(makeArgs({ status: 'PARTIALLY_PAID', paidAmount: 300 })),
    ).rejects.not.toMatchObject({ code: 'CANNOT_SHORTEN_BELOW_PAID' });
  });
});
