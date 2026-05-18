import { describe, it, expect } from 'vitest';
import {
  walkinInvoiceBodySchema,
  walkinInvoiceItemSchema,
  WALKIN_ITEM_CATEGORIES,
  WALKIN_PAYMENT_METHODS,
} from '../walkin-invoice';

describe('walkinInvoiceItemSchema', () => {
  it('accepts a valid BOARDING item', () => {
    const r = walkinInvoiceItemSchema.safeParse({
      category: 'BOARDING',
      description: 'Pension chien 3 nuits',
      quantity: 3,
      unitPrice: 120,
    });
    expect(r.success).toBe(true);
  });

  it('rejects DISCOUNT with positive unitPrice', () => {
    const r = walkinInvoiceItemSchema.safeParse({
      category: 'DISCOUNT',
      description: 'Discount',
      quantity: 1,
      unitPrice: 50,
    });
    expect(r.success).toBe(false);
  });

  it('accepts DISCOUNT with negative unitPrice', () => {
    const r = walkinInvoiceItemSchema.safeParse({
      category: 'DISCOUNT',
      description: 'Promo fidelite',
      quantity: 1,
      unitPrice: -50,
    });
    expect(r.success).toBe(true);
  });

  it('rejects BOARDING with negative unitPrice', () => {
    const r = walkinInvoiceItemSchema.safeParse({
      category: 'BOARDING',
      description: 'X',
      quantity: 1,
      unitPrice: -10,
    });
    expect(r.success).toBe(false);
  });

  it('rejects PRODUCT without productId', () => {
    const r = walkinInvoiceItemSchema.safeParse({
      category: 'PRODUCT',
      description: 'Croquettes Royal Canin',
      quantity: 2,
      unitPrice: 300,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const productIdIssue = r.error.issues.find((i) => i.path.includes('productId'));
      expect(productIdIssue?.message).toBe('PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID');
    }
  });

  it('accepts PRODUCT with productId', () => {
    const r = walkinInvoiceItemSchema.safeParse({
      category: 'PRODUCT',
      description: 'Croquettes',
      quantity: 1,
      unitPrice: 250,
      productId: 'prod_abc',
    });
    expect(r.success).toBe(true);
  });
});

describe('walkinInvoiceBodySchema', () => {
  const validItem = {
    category: 'BOARDING' as const,
    description: 'Pension',
    quantity: 1,
    unitPrice: 120,
  };

  it('accepts a minimal valid body', () => {
    const r = walkinInvoiceBodySchema.safeParse({
      paymentMethod: 'CASH',
      items: [validItem],
    });
    expect(r.success).toBe(true);
  });

  it('rejects body with no items', () => {
    const r = walkinInvoiceBodySchema.safeParse({
      paymentMethod: 'CASH',
      items: [],
    });
    expect(r.success).toBe(false);
  });

  it('rejects body with > 50 items', () => {
    const items = Array.from({ length: 51 }, () => validItem);
    const r = walkinInvoiceBodySchema.safeParse({
      paymentMethod: 'CASH',
      items,
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown extra fields (strict)', () => {
    const r = walkinInvoiceBodySchema.safeParse({
      paymentMethod: 'CASH',
      items: [validItem],
      extraField: 'should-be-rejected',
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid paymentMethod', () => {
    const r = walkinInvoiceBodySchema.safeParse({
      paymentMethod: 'BITCOIN',
      items: [validItem],
    });
    expect(r.success).toBe(false);
  });

  it('accepts clientId=null (anonymous walk-in)', () => {
    const r = walkinInvoiceBodySchema.safeParse({
      clientId: null,
      clientName: 'Walk-in anon',
      paymentMethod: 'CARD',
      items: [validItem],
    });
    expect(r.success).toBe(true);
  });

  it('exposes the canonical category list', () => {
    expect(WALKIN_ITEM_CATEGORIES).toEqual([
      'BOARDING', 'PET_TAXI', 'GROOMING', 'PRODUCT', 'OTHER', 'DISCOUNT',
    ]);
    expect(WALKIN_PAYMENT_METHODS).toEqual(['CASH', 'CARD', 'CHECK', 'TRANSFER']);
  });
});
