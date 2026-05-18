import { describe, it, expect } from 'vitest';
import { recordPaymentBodySchema, PAYMENT_METHODS } from '../record-payment';

describe('recordPaymentBodySchema', () => {
  it('accepts a minimal valid body', () => {
    const r = recordPaymentBodySchema.safeParse({
      amount: 100,
      paymentMethod: 'CASH',
    });
    expect(r.success).toBe(true);
  });

  it('rejects zero amount', () => {
    const r = recordPaymentBodySchema.safeParse({
      amount: 0,
      paymentMethod: 'CASH',
    });
    expect(r.success).toBe(false);
  });

  it('rejects negative amount', () => {
    const r = recordPaymentBodySchema.safeParse({
      amount: -10,
      paymentMethod: 'CASH',
    });
    expect(r.success).toBe(false);
  });

  it('rejects amount > 100M (DB DECIMAL(10,2) overflow guard)', () => {
    const r = recordPaymentBodySchema.safeParse({
      amount: 100_000_000,
      paymentMethod: 'CASH',
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown paymentMethod', () => {
    const r = recordPaymentBodySchema.safeParse({
      amount: 100,
      paymentMethod: 'CRYPTO',
    });
    expect(r.success).toBe(false);
  });

  it('rejects extra fields (strict mode)', () => {
    const r = recordPaymentBodySchema.safeParse({
      amount: 100,
      paymentMethod: 'CASH',
      paidAmount: 200, // legacy field — must be rejected
    });
    expect(r.success).toBe(false);
  });

  it('accepts sendClientSms boolean toggle (ADR-0008)', () => {
    const r = recordPaymentBodySchema.safeParse({
      amount: 100,
      paymentMethod: 'CASH',
      sendClientSms: false,
    });
    expect(r.success).toBe(true);
  });

  it('accepts paymentDate string', () => {
    const r = recordPaymentBodySchema.safeParse({
      amount: 100,
      paymentMethod: 'CASH',
      paymentDate: '2026-05-18',
    });
    expect(r.success).toBe(true);
  });

  it('exposes the canonical payment method list', () => {
    expect(PAYMENT_METHODS).toEqual(['CASH', 'CARD', 'CHECK', 'TRANSFER']);
  });
});
