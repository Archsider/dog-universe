'use client';

import { useEffect } from 'react';

export interface PanelKeyboardCallbacks {
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onFocusEdit: () => void;
  onShowHints: () => void;
}

/**
 * Registers keyboard shortcuts for the booking detail panel.
 * Only active when `enabled` is true (panel is open).
 *
 * Shortcuts:
 *   Esc      → close panel
 *   ↑ / K    → previous booking
 *   ↓ / J    → next booking
 *   E        → focus first editable field (notes)
 *   ?        → toggle keyboard hints overlay
 */
export function usePanelKeyboard(
  enabled: boolean,
  callbacks: PanelKeyboardCallbacks,
) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when focus is inside an input / textarea / contenteditable
      const tag = (e.target as HTMLElement).tagName;
      const isEditable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (e.target as HTMLElement).isContentEditable;

      if (e.key === 'Escape') {
        callbacks.onClose();
        return;
      }

      // Navigation and hints only when NOT editing
      if (isEditable) return;

      switch (e.key) {
        case 'ArrowUp':
        case 'k':
        case 'K':
          e.preventDefault();
          callbacks.onPrev();
          break;
        case 'ArrowDown':
        case 'j':
        case 'J':
          e.preventDefault();
          callbacks.onNext();
          break;
        case 'e':
        case 'E':
          e.preventDefault();
          callbacks.onFocusEdit();
          break;
        case '?':
          e.preventDefault();
          callbacks.onShowHints();
          break;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, callbacks]);
}
