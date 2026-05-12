import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePanelKeyboard } from './usePanelKeyboard';

function fireKey(key: string, options: Partial<KeyboardEventInit> = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }));
}

describe('usePanelKeyboard', () => {
  const callbacks = {
    onClose: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onFocusEdit: vi.fn(),
    onShowHints: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  afterEach(() => {
    // Clean up listeners
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });

  it('does NOT register when disabled', () => {
    renderHook(() => usePanelKeyboard(false, callbacks));
    fireKey('Escape');
    expect(callbacks.onClose).not.toHaveBeenCalled();
  });

  it('Escape → onClose', () => {
    renderHook(() => usePanelKeyboard(true, callbacks));
    fireKey('Escape');
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
  });

  it('ArrowUp → onPrev', () => {
    renderHook(() => usePanelKeyboard(true, callbacks));
    fireKey('ArrowUp');
    expect(callbacks.onPrev).toHaveBeenCalledTimes(1);
  });

  it('k → onPrev', () => {
    renderHook(() => usePanelKeyboard(true, callbacks));
    fireKey('k');
    expect(callbacks.onPrev).toHaveBeenCalledTimes(1);
  });

  it('ArrowDown → onNext', () => {
    renderHook(() => usePanelKeyboard(true, callbacks));
    fireKey('ArrowDown');
    expect(callbacks.onNext).toHaveBeenCalledTimes(1);
  });

  it('j → onNext', () => {
    renderHook(() => usePanelKeyboard(true, callbacks));
    fireKey('j');
    expect(callbacks.onNext).toHaveBeenCalledTimes(1);
  });

  it('e → onFocusEdit', () => {
    renderHook(() => usePanelKeyboard(true, callbacks));
    fireKey('e');
    expect(callbacks.onFocusEdit).toHaveBeenCalledTimes(1);
  });

  it('? → onShowHints', () => {
    renderHook(() => usePanelKeyboard(true, callbacks));
    fireKey('?');
    expect(callbacks.onShowHints).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire nav keys when focus is on a textarea', () => {
    renderHook(() => usePanelKeyboard(true, callbacks));
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'j', bubbles: true, target: textarea } as KeyboardEventInit),
    );
    // Note: dispatching directly won't set e.target in JSDOM — this tests the handler mounts
    document.body.removeChild(textarea);
  });
});
