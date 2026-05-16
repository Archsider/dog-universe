import { describe, it, expect } from 'vitest';
import {
  normalizePhoneForWa,
  buildLongStayMessage,
  buildInactiveClientMessage,
  buildWhatsAppUrl,
  firstNameOf,
} from '../whatsapp';

describe('normalizePhoneForWa', () => {
  it('returns null for empty/null/undefined input', () => {
    expect(normalizePhoneForWa(null)).toBeNull();
    expect(normalizePhoneForWa(undefined)).toBeNull();
    expect(normalizePhoneForWa('')).toBeNull();
  });
  it('strips spaces, dashes, +, parens', () => {
    expect(normalizePhoneForWa('+212 661 234567')).toBe('212661234567');
    expect(normalizePhoneForWa('06-61-23-45-67')).toBe('0661234567');
    expect(normalizePhoneForWa('(212) 661-234-567')).toBe('212661234567');
  });
  it('rejects too-short numbers (< 8 digits)', () => {
    expect(normalizePhoneForWa('12345')).toBeNull();
    expect(normalizePhoneForWa('+1 23')).toBeNull();
  });
  it('keeps already-clean digits as-is', () => {
    expect(normalizePhoneForWa('212661234567')).toBe('212661234567');
  });
});

describe('buildLongStayMessage', () => {
  it('FR variant includes the pet name and day count', () => {
    const msg = buildLongStayMessage({ petName: 'Athéna', daysInPension: 24, locale: 'fr' });
    expect(msg).toContain('Athéna');
    expect(msg).toContain('24 jours');
    expect(msg.toLowerCase()).toContain('bonjour');
  });
  it('EN variant mirrors FR structure', () => {
    const msg = buildLongStayMessage({ petName: 'Max', daysInPension: 30, locale: 'en' });
    expect(msg).toContain('Max');
    expect(msg).toContain('30 days');
    expect(msg.toLowerCase()).toContain('hello');
  });
});

describe('buildInactiveClientMessage', () => {
  it('uses the pet name when available (FR)', () => {
    const msg = buildInactiveClientMessage({
      clientFirstName: 'Khadija',
      lastPetName: 'Luna',
      locale: 'fr',
    });
    expect(msg).toContain('Khadija');
    expect(msg).toContain('Luna');
  });
  it('falls back gracefully when lastPetName is null', () => {
    const msg = buildInactiveClientMessage({
      clientFirstName: 'Youssef',
      lastPetName: null,
      locale: 'fr',
    });
    expect(msg).toContain('Youssef');
    expect(msg).not.toMatch(/null|undefined/);
  });
});

describe('buildWhatsAppUrl', () => {
  it('returns null when the phone is bogus', () => {
    expect(buildWhatsAppUrl(null, 'hi')).toBeNull();
    expect(buildWhatsAppUrl('1234', 'hi')).toBeNull();
  });
  it('URL-encodes the message body', () => {
    const url = buildWhatsAppUrl('+212661234567', 'Bonjour, ça va ?');
    expect(url).toMatch(/^https:\/\/wa\.me\/212661234567\?text=/);
    expect(url).toContain(encodeURIComponent('Bonjour, ça va ?'));
  });
  it('strips formatting from the phone in the URL', () => {
    const url = buildWhatsAppUrl('+212 661-234-567', 'hi');
    expect(url).toContain('wa.me/212661234567?');
  });
});

describe('firstNameOf', () => {
  it('returns the first whitespace-separated token', () => {
    expect(firstNameOf('Mehdi Khattabi')).toBe('Mehdi');
    expect(firstNameOf('Marie  Curie')).toBe('Marie');
  });
  it('returns the whole string for a single-word name', () => {
    expect(firstNameOf('Solo')).toBe('Solo');
  });
  it('falls back to "client" for null/empty', () => {
    expect(firstNameOf(null)).toBe('client');
    expect(firstNameOf('  ')).toBe('client');
  });
});
