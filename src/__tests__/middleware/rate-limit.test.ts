import { describe, it, expect } from 'vitest';
import {
  RATE_LIMITED_ROUTES,
  getDynamicLimitBucket,
} from '../../middleware/rate-limit';

/**
 * Tier 2 hardening (2026-05-09) — config tests for granular buckets.
 *
 * These tests don't hit Upstash; they only verify that the route → bucket
 * routing table is correct, so a future refactor doesn't silently demote
 * a sensitive route to the generic adminMutation (300/h) bucket.
 */
describe('rate-limit route → bucket mapping', () => {
  describe('payment bucket (5 / 60 min)', () => {
    it('routes /api/invoices/{id}/payments to payment bucket', () => {
      expect(getDynamicLimitBucket('/api/invoices/abc123/payments')).toBe('payment');
    });
    it('does not route /api/invoices/{id} (no /payments) to payment bucket', () => {
      expect(getDynamicLimitBucket('/api/invoices/abc123')).toBe(null);
    });
  });

  describe('invoiceCreate bucket (20 / 60 min)', () => {
    it('routes /api/admin/invoices to invoiceCreate', () => {
      expect(getDynamicLimitBucket('/api/admin/invoices')).toBe('invoiceCreate');
    });
    it('routes /api/admin/invoices/standalone to invoiceCreate', () => {
      expect(getDynamicLimitBucket('/api/admin/invoices/standalone')).toBe('invoiceCreate');
    });
    it('does not match /api/admin/invoices/{id} (sub-route)', () => {
      expect(getDynamicLimitBucket('/api/admin/invoices/abc123')).toBe(null);
    });
  });

  describe('vaccinationExtract bucket (10 / 60 min)', () => {
    it('routes /api/pets/{id}/vaccinations/extract to vaccinationExtract', () => {
      expect(getDynamicLimitBucket('/api/pets/pet_42/vaccinations/extract')).toBe(
        'vaccinationExtract',
      );
    });
    it('does not match /api/pets/{id}/vaccinations (no /extract)', () => {
      expect(getDynamicLimitBucket('/api/pets/pet_42/vaccinations')).toBe(null);
    });
  });

  describe('productOrder bucket (30 / 60 min)', () => {
    it('routes /api/client/bookings/{id}/add-product to productOrder', () => {
      expect(getDynamicLimitBucket('/api/client/bookings/bk_1/add-product')).toBe(
        'productOrder',
      );
    });
    it('does not match /api/client/bookings/{id} (no /add-product)', () => {
      expect(getDynamicLimitBucket('/api/client/bookings/bk_1')).toBe(null);
    });
  });

  describe('regression: existing exact routes still mapped', () => {
    it('keeps /api/auth/signin on auth bucket', () => {
      expect(RATE_LIMITED_ROUTES['/api/auth/signin']).toBe('auth');
    });
    it('keeps /api/bookings on bookings bucket', () => {
      expect(RATE_LIMITED_ROUTES['/api/bookings']).toBe('bookings');
    });
  });
});
