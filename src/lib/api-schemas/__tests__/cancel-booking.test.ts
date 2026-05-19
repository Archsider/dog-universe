import { describe, it, expect } from 'vitest';
import { cancelBookingBodySchema } from '../cancel-booking';

describe('cancelBookingBodySchema', () => {
  it('accepts a minimal valid body', () => {
    const r = cancelBookingBodySchema.safeParse({
      reason: 'Client a annulé pour cause de maladie',
    });
    expect(r.success).toBe(true);
  });

  it('rejects reason < 10 chars', () => {
    const r = cancelBookingBodySchema.safeParse({ reason: 'court' });
    expect(r.success).toBe(false);
  });

  it('rejects empty reason after trim', () => {
    const r = cancelBookingBodySchema.safeParse({ reason: '          ' });
    expect(r.success).toBe(false);
  });

  it('rejects reason > 2000 chars', () => {
    const r = cancelBookingBodySchema.safeParse({ reason: 'x'.repeat(2001) });
    expect(r.success).toBe(false);
  });

  it('accepts silent flag', () => {
    const r = cancelBookingBodySchema.safeParse({
      reason: 'Data cleanup admin invisible client',
      silent: true,
    });
    expect(r.success).toBe(true);
  });

  it('rejects extra fields (strict mode)', () => {
    const r = cancelBookingBodySchema.safeParse({
      reason: 'Annulation classique de la réservation',
      bogus: 'rejected',
    });
    expect(r.success).toBe(false);
  });
});
