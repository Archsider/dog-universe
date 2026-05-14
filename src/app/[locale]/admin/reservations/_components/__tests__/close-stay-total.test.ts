import { describe, it, expect } from 'vitest';
import { selectCloseStayTotal } from '../../_lib/close-stay-total';
import { PRICING_DEFAULTS } from '@/lib/pricing-rules';

// Regression test for the bug where the "Total final" amber chip on the
// close-stay modal ignored an already-applied DISCOUNT item and showed the
// gross booking total (1650 MAD) instead of the post-discount invoice
// amount (1500 MAD). The fix is documented in the function itself: prefer
// `invoiceAmount` over `totalPrice` for fixed-date stays.

describe('selectCloseStayTotal', () => {
  const dogs3 = [
    { id: 'p1', name: 'Pia', species: 'DOG' as const },
    { id: 'p2', name: 'Thor', species: 'DOG' as const },
    { id: 'p3', name: 'Jamie', species: 'DOG' as const },
  ];

  it('returns invoice.amount (post-discount) for fixed-date stays', () => {
    // Real scenario from screenshot: 3 chiens × 3 nuits × 100 MAD = 900 +
    // taxi + grooming = 1650 MAD gross, then -150 MAD discount = 1500 MAD.
    expect(
      selectCloseStayTotal({
        isOpenEnded: false,
        pets: dogs3,
        nights: 3,
        pricing: PRICING_DEFAULTS,
        invoiceAmount: 1500,
        totalPrice: 1650,
      }),
    ).toBe(1500);
  });

  it('falls back to booking.totalPrice when no invoice exists yet', () => {
    expect(
      selectCloseStayTotal({
        isOpenEnded: false,
        pets: dogs3,
        nights: 3,
        pricing: PRICING_DEFAULTS,
        invoiceAmount: null,
        totalPrice: 1650,
      }),
    ).toBe(1650);
  });

  it('treats undefined invoiceAmount the same as null (fallback)', () => {
    expect(
      selectCloseStayTotal({
        isOpenEnded: false,
        pets: dogs3,
        nights: 3,
        pricing: PRICING_DEFAULTS,
        invoiceAmount: undefined,
        totalPrice: 1650,
      }),
    ).toBe(1650);
  });

  it('respects an invoiceAmount of 0 (fully discounted) — does NOT fall back', () => {
    // A 100% discount sets invoice.amount = 0. `??` correctly distinguishes
    // 0 from null here; `||` would have wrongly fallen back to totalPrice.
    expect(
      selectCloseStayTotal({
        isOpenEnded: false,
        pets: dogs3,
        nights: 3,
        pricing: PRICING_DEFAULTS,
        invoiceAmount: 0,
        totalPrice: 1650,
      }),
    ).toBe(0);
  });

  it('recomputes live for open-ended stays — ignores invoiceAmount AND totalPrice', () => {
    // Open-ended means the admin is picking the end date NOW; neither the
    // invoice (not yet final) nor the booking total (was 0 at creation,
    // open-ended bookings are stored with totalPrice=0) can be trusted.
    const total = selectCloseStayTotal({
      isOpenEnded: true,
      pets: dogs3,
      nights: 3,
      pricing: PRICING_DEFAULTS,
      invoiceAmount: 9999, // intentionally wrong — must be ignored
      totalPrice: 9999,    // intentionally wrong — must be ignored
    });
    // 3 dogs × 3 nights × 100 MAD/night (multi-dog rate) = 900 MAD
    expect(total).toBe(900);
  });

  it('open-ended: single dog short stay uses the 120 MAD/night rate', () => {
    const total = selectCloseStayTotal({
      isOpenEnded: true,
      pets: [{ id: 'p1', name: 'Pia', species: 'DOG' }],
      nights: 5,
      pricing: PRICING_DEFAULTS,
      invoiceAmount: null,
      totalPrice: 0,
    });
    // 1 dog × 5 nights × 120 MAD = 600 MAD
    expect(total).toBe(600);
  });

  it('open-ended: cat-only stay uses the 70 MAD/night rate', () => {
    const total = selectCloseStayTotal({
      isOpenEnded: true,
      pets: [{ id: 'c1', name: 'Mimi', species: 'CAT' }],
      nights: 4,
      pricing: PRICING_DEFAULTS,
      invoiceAmount: null,
      totalPrice: 0,
    });
    // 1 cat × 4 nights × 70 MAD = 280 MAD
    expect(total).toBe(280);
  });
});
