'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface UseDebouncedSaveOptions {
  /** Milliseconds before triggering save. Default 800. */
  delay?: number;
  /** Called with the latest value after debounce. Return value is ignored on error. */
  onSave: (value: string) => Promise<void>;
  /** Called to revert to original value on save error. */
  onRevert: () => void;
}

export function useDebouncedSave({
  delay = 800,
  onSave,
  onRevert,
}: UseDebouncedSaveOptions) {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestValueRef = useRef<string>('');
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const scheduleAutoSave = useCallback(
    (value: string) => {
      latestValueRef.current = value;
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(async () => {
        if (!isMountedRef.current) return;
        setSaveState('saving');
        try {
          await onSave(latestValueRef.current);
          if (!isMountedRef.current) return;
          setSaveState('saved');
          // Auto-reset to idle after 2s
          setTimeout(() => {
            if (isMountedRef.current) setSaveState('idle');
          }, 2000);
        } catch {
          if (!isMountedRef.current) return;
          setSaveState('error');
          onRevert();
          setTimeout(() => {
            if (isMountedRef.current) setSaveState('idle');
          }, 2000);
        }
      }, delay);
    },
    [delay, onSave, onRevert],
  );

  /** Flush any pending save immediately (e.g. on blur). */
  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (saveState === 'idle') return;
    setSaveState('saving');
    try {
      await onSave(latestValueRef.current);
      if (isMountedRef.current) setSaveState('saved');
      setTimeout(() => {
        if (isMountedRef.current) setSaveState('idle');
      }, 2000);
    } catch {
      if (isMountedRef.current) { setSaveState('error'); onRevert(); }
    }
  }, [saveState, onSave, onRevert]);

  return { scheduleAutoSave, flush, saveState };
}
