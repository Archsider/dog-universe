import { describe, it, expect } from 'vitest';
import {
  RATE_LIMITED_ROUTES,
  RATE_LIMITED_ROUTES_ANY_METHOD,
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

  // -------------------------------------------------------------------------
  // R2a (2026-05-13) — three high-traffic public endpoints lose their Upstash
  // bucket. They're still capped by Vercel/CDN; the goal is to stop ~250K
  // Redis cmds/mois bled on rate-limit sliding-window writes.
  //
  // Crucially: the security-critical buckets (auth, totp, passwordReset,
  // bookings, idempotency keys via the bookings route) MUST remain intact.
  // -------------------------------------------------------------------------
  describe('R2a — endpoints with rate-limit removed', () => {
    it('/api/health is no longer rate-limited (was 60/min)', () => {
      expect(RATE_LIMITED_ROUTES_ANY_METHOD['/api/health']).toBeUndefined();
    });
    it('/api/availability is no longer rate-limited (was 60/15 min)', () => {
      expect(RATE_LIMITED_ROUTES_ANY_METHOD['/api/availability']).toBeUndefined();
    });
    it('/api/taxi-tracking/* no longer matches a dynamic bucket (was 600/h)', () => {
      expect(getDynamicLimitBucket('/api/taxi-tracking/abc123/state')).toBeNull();
      expect(getDynamicLimitBucket('/api/taxi-tracking/abc123/history')).toBeNull();
    });
  });

  describe('R2a — security-critical buckets untouched (regression guard)', () => {
    it('keeps auth bucket on /api/auth/signin', () => {
      expect(RATE_LIMITED_ROUTES['/api/auth/signin']).toBe('auth');
    });
    it('keeps auth bucket on /api/auth/callback/credentials', () => {
      expect(RATE_LIMITED_ROUTES['/api/auth/callback/credentials']).toBe('auth');
    });
    it('keeps auth bucket on /api/register', () => {
      expect(RATE_LIMITED_ROUTES['/api/register']).toBe('auth');
    });
    it('keeps totp bucket on /api/auth/totp/setup', () => {
      expect(RATE_LIMITED_ROUTES['/api/auth/totp/setup']).toBe('totp');
    });
    it('keeps totp bucket on /api/auth/totp/validate', () => {
      expect(RATE_LIMITED_ROUTES['/api/auth/totp/validate']).toBe('totp');
    });
    it('keeps passwordReset bucket on /api/reset-password', () => {
      expect(RATE_LIMITED_ROUTES['/api/reset-password']).toBe('passwordReset');
    });
    it('keeps bookings bucket on /api/bookings (anti double-booking)', () => {
      expect(RATE_LIMITED_ROUTES['/api/bookings']).toBe('bookings');
    });
    it('keeps rgpd bucket on /api/user/export and /api/user/anonymize', () => {
      expect(RATE_LIMITED_ROUTES_ANY_METHOD['/api/user/export']).toBe('rgpd');
      expect(RATE_LIMITED_ROUTES_ANY_METHOD['/api/user/anonymize']).toBe('rgpd');
    });
    it('keeps taxiStream bucket on /api/taxi/{token}/stream (per-open, not polling)', () => {
      expect(getDynamicLimitBucket('/api/taxi/tok_42/stream')).toBe('taxiStream');
    });
  });
});
