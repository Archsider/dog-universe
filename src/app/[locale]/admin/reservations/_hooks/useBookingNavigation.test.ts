import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBookingNavigation } from './useBookingNavigation';

const IDS = ['a', 'b', 'c', 'd', 'e'];

describe('useBookingNavigation', () => {
  it('returns -1 when currentId is null', () => {
    const { result } = renderHook(() =>
      useBookingNavigation({ orderedIds: IDS, currentId: null }),
    );
    expect(result.current.currentIndex).toBe(-1);
    expect(result.current.prevId).toBeNull();
    expect(result.current.nextId).toBeNull();
  });

  it('returns -1 when currentId is not in list', () => {
    const { result } = renderHook(() =>
      useBookingNavigation({ orderedIds: IDS, currentId: 'z' }),
    );
    expect(result.current.currentIndex).toBe(-1);
  });

  it('first element: hasPrev=false, hasNext=true', () => {
    const { result } = renderHook(() =>
      useBookingNavigation({ orderedIds: IDS, currentId: 'a' }),
    );
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.hasPrev).toBe(false);
    expect(result.current.hasNext).toBe(true);
    expect(result.current.prevId).toBeNull();
    expect(result.current.nextId).toBe('b');
  });

  it('last element: hasPrev=true, hasNext=false', () => {
    const { result } = renderHook(() =>
      useBookingNavigation({ orderedIds: IDS, currentId: 'e' }),
    );
    expect(result.current.hasPrev).toBe(true);
    expect(result.current.hasNext).toBe(false);
    expect(result.current.prevId).toBe('d');
    expect(result.current.nextId).toBeNull();
  });

  it('middle element returns correct prev and next', () => {
    const { result } = renderHook(() =>
      useBookingNavigation({ orderedIds: IDS, currentId: 'c' }),
    );
    expect(result.current.currentIndex).toBe(2);
    expect(result.current.total).toBe(5);
    expect(result.current.prevId).toBe('b');
    expect(result.current.nextId).toBe('d');
  });

  it('handles empty list', () => {
    const { result } = renderHook(() =>
      useBookingNavigation({ orderedIds: [], currentId: 'a' }),
    );
    expect(result.current.currentIndex).toBe(-1);
    expect(result.current.total).toBe(0);
  });

  it('handles single-element list', () => {
    const { result } = renderHook(() =>
      useBookingNavigation({ orderedIds: ['only'], currentId: 'only' }),
    );
    expect(result.current.hasPrev).toBe(false);
    expect(result.current.hasNext).toBe(false);
  });
});
