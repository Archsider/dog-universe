import { describe, it, expect } from 'vitest';
import { integerToFrenchWords, montantEnLettresMAD } from '@/lib/number-to-words-fr';

describe('integerToFrenchWords — French spelling rules', () => {
  const cases: [number, string][] = [
    [0, 'zéro'],
    [1, 'un'],
    [7, 'sept'],
    [16, 'seize'],
    [17, 'dix-sept'],
    [20, 'vingt'],
    [21, 'vingt et un'],
    [22, 'vingt-deux'],
    [31, 'trente et un'],
    [70, 'soixante-dix'],
    [71, 'soixante et onze'],
    [72, 'soixante-douze'],
    [79, 'soixante-dix-neuf'],
    [80, 'quatre-vingts'],
    [81, 'quatre-vingt-un'],
    [90, 'quatre-vingt-dix'],
    [91, 'quatre-vingt-onze'],
    [99, 'quatre-vingt-dix-neuf'],
    [100, 'cent'],
    [101, 'cent un'],
    [180, 'cent quatre-vingts'],
    [200, 'deux cents'],
    [201, 'deux cent un'],
    [300, 'trois cents'],
    [1000, 'mille'],
    [1001, 'mille un'],
    [1980, 'mille neuf cent quatre-vingts'],
    [2000, 'deux mille'],
    [2025, 'deux mille vingt-cinq'],
    [100000, 'cent mille'],
    [1000000, 'un million'],
    [2000000, 'deux millions'],
    [1355, 'mille trois cent cinquante-cinq'],
  ];
  it.each(cases)('%d → %s', (n, words) => {
    expect(integerToFrenchWords(n)).toBe(words);
  });
});

describe('montantEnLettresMAD', () => {
  it('formats whole dirhams (capitalised, plural)', () => {
    expect(montantEnLettresMAD(1355)).toBe('Mille trois cent cinquante-cinq dirhams');
  });
  it('singular dirham for 1 / 0', () => {
    expect(montantEnLettresMAD(1)).toBe('Un dirham');
    expect(montantEnLettresMAD(0)).toBe('Zéro dirham');
  });
  it('appends centimes with "et", rounded to the centime', () => {
    expect(montantEnLettresMAD(1355.2)).toBe('Mille trois cent cinquante-cinq dirhams et vingt centimes');
    expect(montantEnLettresMAD(0.01)).toBe('Zéro dirham et un centime');
    expect(montantEnLettresMAD(840.5)).toBe('Huit cent quarante dirhams et cinquante centimes');
  });
  it('rounds float drift to the centime', () => {
    expect(montantEnLettresMAD(700.105)).toBe('Sept cents dirhams et onze centimes');
  });
  it('prefixes "moins" for negatives (discount/refund lines)', () => {
    expect(montantEnLettresMAD(-50)).toBe('Moins cinquante dirhams');
  });
});
