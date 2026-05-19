import { describe, it, expect } from 'vitest';
import {
  createInvoiceBodySchema,
  patchInvoiceBodySchema,
  invoiceItemSchema,
  INVOICE_ITEM_CATEGORIES,
  INVOICE_PAYMENT_METHODS,
  INVOICE_SERVICE_TYPES,
  INVOICE_STATUSES,
} from '../invoice';

describe('invoiceItemSchema', () => {
  it('accepts a valid BOARDING item', () => {
    const r = invoiceItemSchema.safeParse({
      description: 'Pension chien 3 nuits',
      quantity: 3,
      unitPrice: 120,
      category: 'BOARDING',
    });
    expect(r.success).toBe(true);
  });

  it('rejects DISCOUNT with positive unitPrice', () => {
    const r = invoiceItemSchema.safeParse({
      description: 'Promo',
      quantity: 1,
      unitPrice: 50,
      category: 'DISCOUNT',
    });
    expect(r.success).toBe(false);
  });

  it('accepts DISCOUNT with negative unitPrice', () => {
    const r = invoiceItemSchema.safeParse({
      description: 'Remise fidélité',
      quantity: 1,
      unitPrice: -50,
      category: 'DISCOUNT',
    });
    expect(r.success).toBe(true);
  });

  it('rejects BOARDING with negative unitPrice', () => {
    const r = invoiceItemSchema.safeParse({
      description: 'X',
      quantity: 1,
      unitPrice: -10,
      category: 'BOARDING',
    });
    expect(r.success).toBe(false);
  });

  it('rejects PRODUCT without productId', () => {
    const r = invoiceItemSchema.safeParse({
      description: 'Croquettes',
      quantity: 1,
      unitPrice: 250,
      category: 'PRODUCT',
    });
    expect(r.success).toBe(false);
  });

  it('accepts PRODUCT with productId', () => {
    const r = invoiceItemSchema.safeParse({
      description: 'Croquettes',
      quantity: 1,
      unitPrice: 250,
      category: 'PRODUCT',
      productId: 'prod_abc',
    });
    expect(r.success).toBe(true);
  });
});

describe('createInvoiceBodySchema', () => {
  const validItem = {
    description: 'Pension',
    quantity: 1,
    unitPrice: 120,
    total: 120,
    category: 'BOARDING' as const,
  };

  it('accepts a minimal valid body', () => {
    const r = createInvoiceBodySchema.safeParse({
      clientId: 'usr_abc',
      items: [validItem],
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty items array', () => {
    const r = createInvoiceBodySchema.safeParse({
      clientId: 'usr_abc',
      items: [],
    });
    expect(r.success).toBe(false);
  });

  it('rejects > 50 items', () => {
    const items = Array.from({ length: 51 }, () => validItem);
    const r = createInvoiceBodySchema.safeParse({
      clientId: 'usr_abc',
      items,
    });
    expect(r.success).toBe(false);
  });

  it('rejects markPaid=true without paymentMethod', () => {
    const r = createInvoiceBodySchema.safeParse({
      clientId: 'usr_abc',
      items: [validItem],
      markPaid: true,
    });
    expect(r.success).toBe(false);
  });

  it('accepts markPaid=true with paymentMethod', () => {
    const r = createInvoiceBodySchema.safeParse({
      clientId: 'usr_abc',
      items: [validItem],
      markPaid: true,
      paymentMethod: 'CASH',
    });
    expect(r.success).toBe(true);
  });

  it('rejects extra fields (strict mode)', () => {
    const r = createInvoiceBodySchema.safeParse({
      clientId: 'usr_abc',
      items: [validItem],
      unknownField: 'oops',
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown serviceType', () => {
    const r = createInvoiceBodySchema.safeParse({
      clientId: 'usr_abc',
      items: [validItem],
      serviceType: 'BITCOIN_MINING',
    });
    expect(r.success).toBe(false);
  });
});

describe('patchInvoiceBodySchema', () => {
  it('accepts a status-only patch', () => {
    const r = patchInvoiceBodySchema.safeParse({
      status: 'PAID',
    });
    expect(r.success).toBe(true);
  });

  it('accepts a full edit with items', () => {
    const r = patchInvoiceBodySchema.safeParse({
      version: 3,
      items: [
        {
          description: 'Updated item',
          quantity: 2,
          unitPrice: 50,
          category: 'OTHER',
        },
      ],
      notes: 'Edit après revue',
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown status', () => {
    const r = patchInvoiceBodySchema.safeParse({
      status: 'OVERPAID',
    });
    expect(r.success).toBe(false);
  });

  it('rejects extra fields (strict)', () => {
    const r = patchInvoiceBodySchema.safeParse({
      status: 'PAID',
      sneaky: 'extra',
    });
    expect(r.success).toBe(false);
  });

  it('exposes the canonical enum lists', () => {
    expect(INVOICE_ITEM_CATEGORIES).toContain('BOARDING');
    expect(INVOICE_ITEM_CATEGORIES).toContain('DISCOUNT');
    expect(INVOICE_PAYMENT_METHODS).toEqual(['CASH', 'CARD', 'CHECK', 'TRANSFER']);
    expect(INVOICE_SERVICE_TYPES).toContain('BOARDING');
    expect(INVOICE_STATUSES).toEqual(['PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED']);
  });
});
