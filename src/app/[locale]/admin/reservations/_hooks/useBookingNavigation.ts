'use client';

import { useMemo } from 'react';

export interface UseBookingNavigationOptions {
  /** Ordered list of booking IDs in the current view. */
  orderedIds: string[];
  /** Currently open booking ID. */
  currentId: string | null;
}

export interface BookingNavigationResult {
  currentIndex: number;    // -1 if not found
  total: number;
  prevId: string | null;
  nextId: string | null;
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * Pure navigation logic over an ordered list of IDs.
 * Does NOT mutate URL — the caller is responsible for routing.
 */
export function useBookingNavigation({
  orderedIds,
  currentId,
}: UseBookingNavigationOptions): BookingNavigationResult {
  return useMemo(() => {
    const total = orderedIds.length;
    if (!currentId || total === 0) {
      return { currentIndex: -1, total, prevId: null, nextId: null, hasPrev: false, hasNext: false };
    }
    const idx = orderedIds.indexOf(currentId);
    if (idx === -1) {
      return { currentIndex: -1, total, prevId: null, nextId: null, hasPrev: false, hasNext: false };
    }
    const prevId = idx > 0 ? orderedIds[idx - 1] : null;
    const nextId = idx < total - 1 ? orderedIds[idx + 1] : null;
    return {
      currentIndex: idx,
      total,
      prevId,
      nextId,
      hasPrev: idx > 0,
      hasNext: idx < total - 1,
    };
  }, [orderedIds, currentId]);
}
