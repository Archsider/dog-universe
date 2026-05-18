import { describe, it, expect } from 'vitest';
import { cancelInvoiceBodySchema } from '../cancel-invoice';

describe('cancelInvoiceBodySchema', () => {
  it('accepts a minimal valid body', () => {
    const r = cancelInvoiceBodySchema.safeParse({
      reason: 'Doublon avec facture principale',
    });
    expect(r.success).toBe(true);
  });

  it('rejects reason < 10 chars', () => {
    const r = cancelInvoiceBodySchema.safeParse({ reason: 'court' });
    expect(r.success).toBe(false);
  });

  it('rejects reason > 2000 chars', () => {
    const r = cancelInvoiceBodySchema.safeParse({ reason: 'x'.repeat(2001) });
    expect(r.success).toBe(false);
  });

  it('trims reason before validating length', () => {
    const r = cancelInvoiceBodySchema.safeParse({ reason: '   short    ' });
    expect(r.success).toBe(false);
  });

  it('accepts refund opt-in shape', () => {
    const r = cancelInvoiceBodySchema.safeParse({
      reason: 'Annulation avec remboursement client',
      refundExisting: true,
      paymentMethodForRefund: 'CASH',
    });
    expect(r.success).toBe(true);
  });

  it('accepts silent flag', () => {
    const r = cancelInvoiceBodySchema.safeParse({
      reason: 'Data cleanup admin invisible client',
      silent: true,
    });
    expect(r.success).toBe(true);
  });

  it('rejects extra fields (strict)', () => {
    const r = cancelInvoiceBodySchema.safeParse({
      reason: 'Doublon avec facture principale',
      foo: 'bar',
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown refund payment method', () => {
    const r = cancelInvoiceBodySchema.safeParse({
      reason: 'Refund via crypto inacceptable',
      refundExisting: true,
      paymentMethodForRefund: 'BITCOIN',
    });
    expect(r.success).toBe(false);
  });
});
