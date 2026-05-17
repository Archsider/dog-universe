import { describe, it, expect } from 'vitest';
import { normalize, tokenize, scoreMatch, findBestMatch } from '@/lib/product-catalog-match';

describe('product-catalog-match', () => {
  describe('normalize', () => {
    it('lowercases and strips diacritics', () => {
      expect(normalize('Croquettes Royal Canin')).toBe('croquettes royal canin');
      expect(normalize('Médicament')).toBe('medicament');
    });
    it('strips punctuation and collapses whitespace', () => {
      expect(normalize('Royal-Canin   10kg!')).toBe('royal canin 10kg');
    });
  });

  describe('tokenize', () => {
    it('keeps words ≥ 3 chars', () => {
      expect(tokenize('Royal Canin 10kg')).toEqual(['royal', 'canin', '10kg']);
      expect(tokenize('a bc def')).toEqual(['def']);
    });
  });

  describe('scoreMatch', () => {
    it('returns 0 for no shared tokens', () => {
      const { confidence } = scoreMatch('Toilettage long', { id: '1', name: 'Royal Canin' });
      expect(confidence).toBe(0);
    });
    it('scores ≥ 0.8 when most tokens overlap', () => {
      const { confidence, matchedTokens } = scoreMatch('Royal Canin Adult', { id: '1', name: 'Royal Canin Adult' });
      expect(confidence).toBeGreaterThanOrEqual(0.8);
      expect(matchedTokens).toEqual(expect.arrayContaining(['royal', 'canin', 'adult']));
    });
    it('penalises long product names with few shared tokens', () => {
      const { confidence } = scoreMatch('Royal', { id: '1', name: 'Royal Canin Veterinary Diet Hepatic 12kg' });
      // 1 matched token / 6 unique candidate tokens → ~0.16
      expect(confidence).toBeLessThan(0.5);
    });
  });

  describe('findBestMatch', () => {
    const catalog = [
      { id: 'p1', name: 'Royal Canin Adult Medium' },
      { id: 'p2', name: 'Hills Science Plan Puppy' },
      { id: 'p3', name: 'Canvit Junior Senior' },
    ];

    it('returns null for empty / too-short descriptions', () => {
      expect(findBestMatch('', catalog)).toBeNull();
      expect(findBestMatch('foo', catalog)).toBeNull();
    });

    it('returns null when no candidate scores ≥ minConfidence', () => {
      expect(findBestMatch('Toilettage Tobie', catalog, 0.8)).toBeNull();
    });

    it('returns the highest-confidence match', () => {
      const match = findBestMatch('Royal Canin Adult Medium', catalog, 0.8);
      expect(match).not.toBeNull();
      expect(match?.productId).toBe('p1');
      expect(match?.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('handles accented descriptions', () => {
      const cat = [{ id: 'p1', name: 'Médicament antiparasitaire' }];
      const match = findBestMatch('medicament antiparasitaire chien', cat, 0.5);
      expect(match?.productId).toBe('p1');
    });
  });
});
