/**
 * Unit tests — Zod schemas in src/lib/validation.ts
 *
 * Focus on the integrity guards added in Sprint 2 :
 *   - bookingCreateSchema (CLIENT path) : endDate >= startDate ;
 *     totalPrice is shape-accepted but never trusted server-side
 *     (filtered by the route — covered by integration tests).
 *   - adminBookingCreateSchema : endDate >= startDate ; totalPrice is
 *     authoritative for ADMIN (kept as-is).
 *   - dateStringSchema : rejects garbage / unparseable strings.
 */

import { describe, it, expect } from 'vitest';
import { bookingCreateSchema, adminBookingCreateSchema } from '@/lib/validation';

const baseClient = {
  serviceType: 'BOARDING' as const,
  petIds: ['pet-1'],
};

const baseAdmin = {
  clientId: 'client-1',
  serviceType: 'BOARDING' as const,
  totalPrice: 100,
};

describe('bookingCreateSchema (CLIENT) — date range', () => {
  it('accepts startDate without endDate', () => {
    const r = bookingCreateSchema.safeParse({ ...baseClient, startDate: '2026-06-01' });
    expect(r.success).toBe(true);
  });

  it('rejects endDate < startDate with INVALID_DATE_RANGE', () => {
    const r = bookingCreateSchema.safeParse({
      ...baseClient,
      startDate: '2026-06-10',
      endDate: '2026-06-05',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msgs = r.error.issues.map((i) => i.message);
      expect(msgs).toContain('INVALID_DATE_RANGE');
    }
  });

  it('accepts endDate === startDate (same-day stay)', () => {
    const r = bookingCreateSchema.safeParse({
      ...baseClient,
      startDate: '2026-06-10',
      endDate: '2026-06-10',
    });
    expect(r.success).toBe(true);
  });

  it('accepts endDate > startDate', () => {
    const r = bookingCreateSchema.safeParse({
      ...baseClient,
      startDate: '2026-06-10',
      endDate: '2026-06-15',
    });
    expect(r.success).toBe(true);
  });

  it('rejects garbage startDate string (INVALID_DATE on dateStringSchema)', () => {
    const r = bookingCreateSchema.safeParse({
      ...baseClient,
      startDate: 'not-a-date',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msgs = r.error.issues.map((i) => i.message);
      expect(msgs).toContain('INVALID_DATE');
    }
  });
});

describe('bookingCreateSchema (CLIENT) — totalPrice handling', () => {
  // The schema accepts totalPrice for back-compat (admin payloads sometimes
  // hit /api/bookings) but the route code never trusts it for CLIENT users:
  // see resolvedTotalPrice in src/app/api/bookings/route.ts which recomputes
  // server-side. These tests pin the SHAPE only.
  it('parses CLIENT submit with totalPrice: 0 (field present in output)', () => {
    const r = bookingCreateSchema.safeParse({
      ...baseClient,
      startDate: '2026-06-01',
      totalPrice: 0,
    });
    expect(r.success).toBe(true);
    // The field passes the schema — it's the route's job to ignore it for CLIENT.
    if (r.success) {
      expect(r.data.totalPrice).toBe(0);
    }
  });

  it('parses CLIENT submit without totalPrice (undefined in output)', () => {
    const r = bookingCreateSchema.safeParse({
      ...baseClient,
      startDate: '2026-06-01',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.totalPrice).toBeUndefined();
    }
  });

  it('rejects negative totalPrice', () => {
    const r = bookingCreateSchema.safeParse({
      ...baseClient,
      startDate: '2026-06-01',
      totalPrice: -10,
    });
    expect(r.success).toBe(false);
  });
});

describe('adminBookingCreateSchema — date range', () => {
  it('accepts endDate === startDate', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...baseAdmin,
      startDate: '2026-06-10',
      endDate: '2026-06-10',
    });
    expect(r.success).toBe(true);
  });

  it('rejects endDate < startDate with INVALID_DATE_RANGE', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...baseAdmin,
      startDate: '2026-06-10',
      endDate: '2026-06-05',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msgs = r.error.issues.map((i) => i.message);
      expect(msgs).toContain('INVALID_DATE_RANGE');
    }
  });

  it('accepts and preserves totalPrice for ADMIN', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...baseAdmin,
      startDate: '2026-06-10',
      totalPrice: 250,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.totalPrice).toBe(250);
    }
  });

  it('rejects totalPrice > 1_000_000', () => {
    const r = adminBookingCreateSchema.safeParse({
      ...baseAdmin,
      startDate: '2026-06-10',
      totalPrice: 2_000_000,
    });
    expect(r.success).toBe(false);
  });
});
