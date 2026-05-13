/**
 * Unit tests — admin booking creation validation (adminBookingCreateSchema).
 *
 * 6 business cases (inscribed × walk-in × status permutations):
 *  Case 1: walk-in client + dates fixes + IN_PROGRESS → success
 *  Case 2: walk-in client + open-ended + IN_PROGRESS → success
 *  Case 3: walk-in client + dates fixes + COMPLETED (retroactive) → success
 *  Case 4: inscribed client + dates fixes + IN_PROGRESS → success
 *  Case 5: inscribed client + open-ended + IN_PROGRESS → success
 *  Case 6: inscribed client + dates fixes + COMPLETED (retroactive) → success
 *
 * Error cases:
 *  E1: isOpenEnded=true + initialStatus=PENDING → OPEN_ENDED_CANNOT_BE_PENDING
 *  E2: initialStatus=COMPLETED without finalAmount → FINAL_AMOUNT_REQUIRED
 *  E3: initialStatus=COMPLETED without endDate → END_DATE_REQUIRED_FOR_COMPLETED
 *  E4: isOpenEnded=true + initialStatus=COMPLETED → WALKIN_OPENENDED_WITH_COMPLETED
 */

import { describe, it, expect } from 'vitest';
import { adminBookingCreateSchema } from '@/lib/validation';

// Shared base for walk-in (on-the-fly) client
const walkInBase = {
  walkIn: { name: 'Client Walk-in', phone: '0600000000' },
  serviceType: 'BOARDING' as const,
  startDate: '2026-05-01',
  totalPrice: 0,
};

// Shared base for an inscribed (registered) client
const inscribedBase = {
  clientId: 'clnt_registered_123',
  petIds: ['pet_abc'],
  serviceType: 'BOARDING' as const,
  startDate: '2026-05-01',
  totalPrice: 0,
};

describe('adminBookingCreateSchema — walk-in client scenarios', () => {
  it('Case 1: walk-in + dates fixes + IN_PROGRESS → success', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...walkInBase,
      endDate: '2026-05-05',
      initialStatus: 'IN_PROGRESS',
    });
    expect(r.success).toBe(true);
  });

  it('Case 2: walk-in + open-ended + IN_PROGRESS → success', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...walkInBase,
      isOpenEnded: true,
      initialStatus: 'IN_PROGRESS',
    });
    expect(r.success).toBe(true);
  });

  it('Case 3: walk-in + dates fixes + COMPLETED (retroactive) → success', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...walkInBase,
      endDate: '2026-05-05',
      initialStatus: 'COMPLETED',
      finalAmount: 600,
    });
    expect(r.success).toBe(true);
  });
});

describe('adminBookingCreateSchema — inscribed client scenarios', () => {
  it('Case 4: inscribed + dates fixes + IN_PROGRESS → success', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...inscribedBase,
      endDate: '2026-05-05',
      initialStatus: 'IN_PROGRESS',
    });
    expect(r.success).toBe(true);
  });

  it('Case 5: inscribed + open-ended + IN_PROGRESS → success', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...inscribedBase,
      isOpenEnded: true,
      initialStatus: 'IN_PROGRESS',
    });
    expect(r.success).toBe(true);
  });

  it('Case 6: inscribed + dates fixes + COMPLETED (retroactive) → success', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...inscribedBase,
      endDate: '2026-05-05',
      initialStatus: 'COMPLETED',
      finalAmount: 500,
    });
    expect(r.success).toBe(true);
  });
});

describe('adminBookingCreateSchema — error cases', () => {
  it('E1: isOpenEnded=true + initialStatus=PENDING → OPEN_ENDED_CANNOT_BE_PENDING', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...walkInBase,
      isOpenEnded: true,
      initialStatus: 'PENDING',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i: { message: string }) => i.message)).toContain('OPEN_ENDED_CANNOT_BE_PENDING');
    }
  });

  it('E2: initialStatus=COMPLETED without finalAmount → FINAL_AMOUNT_REQUIRED', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...walkInBase,
      endDate: '2026-05-05',
      initialStatus: 'COMPLETED',
      // finalAmount intentionally omitted
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i: { message: string }) => i.message)).toContain('FINAL_AMOUNT_REQUIRED');
    }
  });

  it('E3: initialStatus=COMPLETED without endDate → END_DATE_REQUIRED_FOR_COMPLETED', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...walkInBase,
      initialStatus: 'COMPLETED',
      finalAmount: 600,
      // endDate intentionally omitted
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i: { message: string }) => i.message)).toContain('END_DATE_REQUIRED_FOR_COMPLETED');
    }
  });

  it('E4: isOpenEnded=true + initialStatus=COMPLETED → WALKIN_OPENENDED_WITH_COMPLETED', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...walkInBase,
      isOpenEnded: true,
      initialStatus: 'COMPLETED',
      finalAmount: 600,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i: { message: string }) => i.message)).toContain('WALKIN_OPENENDED_WITH_COMPLETED');
    }
  });

  it('E4 (inscribed): inscribed + isOpenEnded=true + COMPLETED → WALKIN_OPENENDED_WITH_COMPLETED', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...inscribedBase,
      isOpenEnded: true,
      initialStatus: 'COMPLETED',
      finalAmount: 600,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i: { message: string }) => i.message)).toContain('WALKIN_OPENENDED_WITH_COMPLETED');
    }
  });
});
