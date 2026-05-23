import { describe, it, expect } from 'vitest';
import { toE164, waLink, buildOverdueInvoiceMessage } from '@/lib/whatsapp';

describe('toE164', () => {
  it('returns null for empty / unusable input', () => {
    expect(toE164(null)).toBeNull();
    expect(toE164('')).toBeNull();
    expect(toE164('abc')).toBeNull();
  });

  it('converts a Moroccan mobile (06/07) to +212', () => {
    expect(toE164('0612345678')).toBe('+212612345678');
    expect(toE164('07 12 34 56 78')).toBe('+212712345678');
  });

  it('treats 00 as the international prefix', () => {
    expect(toE164('00212612345678')).toBe('+212612345678');
  });

  it('passes through a valid +E.164 number', () => {
    expect(toE164('+212612345678')).toBe('+212612345678');
  });
});

describe('waLink', () => {
  it('returns null when the phone is unusable (caller hides the button)', () => {
    expect(waLink(null, 'hi')).toBeNull();
    expect(waLink('xyz', 'hi')).toBeNull();
  });

  it('builds a wa.me link without the + and url-encodes the message', () => {
    const link = waLink('0612345678', 'Bonjour & merci');
    expect(link).toBe('https://wa.me/212612345678?text=Bonjour%20%26%20merci');
  });
});

describe('buildOverdueInvoiceMessage', () => {
  it('uses the client first name + invoice number + amount (FR)', () => {
    const msg = buildOverdueInvoiceMessage({
      clientName: 'Mehdi Bennani',
      invoiceNumber: 'DU-2026-0042',
      amountLabel: '1 200 MAD',
      locale: 'fr',
    });
    expect(msg).toContain('Bonjour Mehdi');
    expect(msg).toContain('DU-2026-0042');
    expect(msg).toContain('1 200 MAD');
  });

  it('falls back to a generic greeting when name is blank (EN)', () => {
    const msg = buildOverdueInvoiceMessage({
      clientName: null,
      invoiceNumber: 'DU-1',
      amountLabel: '50 MAD',
      locale: 'en',
    });
    expect(msg.startsWith('Hello,')).toBe(true);
    expect(msg).toContain('DU-1');
    expect(msg).toContain('50 MAD');
  });
});
