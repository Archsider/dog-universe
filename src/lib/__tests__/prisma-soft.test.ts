import { describe, it, expect } from 'vitest';
import { notDeleted, onlyDeleted } from '../prisma-soft';

describe('notDeleted', () => {
  it('returns { deletedAt: null } when no where is passed', () => {
    expect(notDeleted()).toEqual({ deletedAt: null });
  });

  it('preserves other fields and adds deletedAt: null', () => {
    expect(notDeleted({ role: 'CLIENT' as const })).toEqual({
      role: 'CLIENT',
      deletedAt: null,
    });
  });

  it('respects an explicit deletedAt: { not: null } (does not silently override)', () => {
    const w = { id: 'u1', deletedAt: { not: null } } as const;
    expect(notDeleted(w)).toBe(w);
  });

  it('respects an explicit deletedAt: { lt: someDate }', () => {
    const cutoff = new Date('2026-01-01');
    const w = { deletedAt: { lt: cutoff } };
    expect(notDeleted(w)).toBe(w);
  });

  it('overrides when deletedAt is undefined (treated as not set)', () => {
    const w = { role: 'ADMIN' as const, deletedAt: undefined };
    expect(notDeleted(w)).toEqual({ role: 'ADMIN', deletedAt: null });
  });

  it('preserves a Date-typed deletedAt (caller asked for an exact deletion timestamp)', () => {
    const d = new Date('2026-05-01');
    const w = { deletedAt: d };
    expect(notDeleted(w)).toBe(w);
  });

  it('does not mutate the input object when adding deletedAt', () => {
    const input = { role: 'CLIENT' as const };
    const result = notDeleted(input);
    expect(input).toEqual({ role: 'CLIENT' });
    expect(result).not.toBe(input);
  });

  it('handles nested AND/OR Prisma clauses without losing them', () => {
    const w = {
      OR: [{ name: { contains: 'foo' } }, { email: { contains: 'foo' } }],
    };
    const out = notDeleted(w);
    expect(out).toEqual({
      OR: [{ name: { contains: 'foo' } }, { email: { contains: 'foo' } }],
      deletedAt: null,
    });
  });
});

describe('onlyDeleted', () => {
  it('returns { deletedAt: { not: null } } when no where is passed', () => {
    expect(onlyDeleted()).toEqual({ deletedAt: { not: null } });
  });

  it('adds the not-null filter while preserving fields', () => {
    expect(onlyDeleted({ role: 'CLIENT' as const })).toEqual({
      role: 'CLIENT',
      deletedAt: { not: null },
    });
  });

  it('respects an explicit deletedAt (caller knows what they want)', () => {
    const w = { deletedAt: null };
    expect(onlyDeleted(w)).toBe(w);
  });
});
