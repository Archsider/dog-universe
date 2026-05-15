import { describe, it, expect } from 'vitest';
import { escapeCsv, UTF8_BOM } from '../csv';

describe('escapeCsv — safety contract', () => {
  // Formula injection mitigation (session 2026-03-20 security audit).
  it('prefixes cells starting with = to neutralise Excel formulas', () => {
    expect(escapeCsv('=SUM(A1:A10)')).toBe(`'=SUM(A1:A10)`);
  });

  it('prefixes +, -, @, tab, CR for the same reason', () => {
    expect(escapeCsv('+EVIL')).toBe(`'+EVIL`);
    expect(escapeCsv('-EVIL')).toBe(`'-EVIL`);
    expect(escapeCsv('@EVIL')).toBe(`'@EVIL`);
    expect(escapeCsv('\tEVIL')).toBe(`'\tEVIL`);
    expect(escapeCsv('\rEVIL')).toBe(`'\rEVIL`);
  });

  it('does NOT prefix benign strings', () => {
    expect(escapeCsv('Kabbaj Rita')).toBe('Kabbaj Rita');
    expect(escapeCsv('12 rue de Casa')).toBe('12 rue de Casa');
  });

  it('quotes values containing ; (CSV separator) and doubles internal quotes', () => {
    expect(escapeCsv('Hello; world')).toBe('"Hello; world"');
    expect(escapeCsv('She said "hi"')).toBe('"She said ""hi"""');
  });

  it('quotes values containing newlines', () => {
    expect(escapeCsv('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
  });

  it('coerces numbers + null + undefined', () => {
    expect(escapeCsv(42)).toBe('42');
    expect(escapeCsv(null)).toBe('');
    expect(escapeCsv(undefined)).toBe('');
  });

  it('combines formula prefix + RFC quoting when both apply', () => {
    // `="HYPERLINK"` starts with `=` AND contains `"`. Order matters :
    // (1) apostrophe prefix neutralise la formule
    // (2) puis le `"` interne force le wrap RFC 4180 avec doublement
    // Le wrapping CSV externe est invisible côté Excel — la cellule effective
    // commence bien par `'` après désérialisation. C'est la safety property.
    expect(escapeCsv('="HYPERLINK"')).toBe(`"'=""HYPERLINK"""`);
  });
});

describe('UTF8_BOM', () => {
  it('is a single 3-byte UTF-8 marker', () => {
    expect(UTF8_BOM).toBe('﻿');
    expect(UTF8_BOM.length).toBe(1); // 1 char (3 bytes in UTF-8)
  });
});
