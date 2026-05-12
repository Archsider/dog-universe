/**
 * Unit tests — walk-in booking validation (adminBookingCreateSchema refinements).
 *
 * 5 cases from the spec:
 *  Case 1: walk-in classique (IN_PROGRESS, dates connues) → success
 *  Case 2: walk-in durée ouverte (isOpenEnded=true, IN_PROGRESS) → success
 *  Case 3: walk-in rétroactif (COMPLETED) → requires endDate + finalAmount
 *  Case 4: isOpenEnded=true + initialStatus=PENDING → OPEN_ENDED_CANNOT_BE_PENDING
 *  Case 5: initialStatus=COMPLETED + finalAmount absent → FINAL_AMOUNT_REQUIRED
 */

import { describe, it, expect } from 'vitest';
import { adminBookingCreateSchema } from '@/lib/validation';

const base = {
  walkIn: { name: 'Client Walk-in', phone: '0600000000' },
  serviceType: 'BOARDING' as const,
  startDate: '2026-05-01',
  totalPrice: 0,
};

describe('adminBookingCreateSchema — walk-in refinements', () => {
  it('Case 1: walk-in classique IN_PROGRESS with known dates → success', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...base,
      endDate: '2026-05-05',
      initialStatus: 'IN_PROGRESS',
    });
    expect(r.success).toBe(true);
  });

  it('Case 2: walk-in open-ended (isOpenEnded=true, IN_PROGRESS) → success', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...base,
      isOpenEnded: true,
      initialStatus: 'IN_PROGRESS',
    });
    expect(r.success).toBe(true);
  });

  it('Case 3: walk-in rétroactif COMPLETED with endDate + finalAmount → success', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...base,
      endDate: '2026-05-05',
      initialStatus: 'COMPLETED',
      finalAmount: 600,
    });
    expect(r.success).toBe(true);
  });

  it('Case 4: isOpenEnded=true + initialStatus=PENDING → OPEN_ENDED_CANNOT_BE_PENDING', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...base,
      isOpenEnded: true,
      initialStatus: 'PENDING',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const codes = r.error.issues.map(i => i.message);
      expect(codes).toContain('OPEN_ENDED_CANNOT_BE_PENDING');
    }
  });

  it('Case 5: initialStatus=COMPLETED without finalAmount → FINAL_AMOUNT_REQUIRED', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...base,
      endDate: '2026-05-05',
      initialStatus: 'COMPLETED',
      // finalAmount intentionally omitted
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const codes = r.error.issues.map(i => i.message);
      expect(codes).toContain('FINAL_AMOUNT_REQUIRED');
    }
  });

  it('Case 3b: COMPLETED without endDate → END_DATE_REQUIRED_FOR_COMPLETED', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...base,
      initialStatus: 'COMPLETED',
      finalAmount: 600,
      // endDate intentionally omitted
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const codes = r.error.issues.map(i => i.message);
      expect(codes).toContain('END_DATE_REQUIRED_FOR_COMPLETED');
    }
  });
});
