import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedSave } from './useDebouncedSave';

describe('useDebouncedSave', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('starts in idle state', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onRevert = vi.fn();
    const { result } = renderHook(() => useDebouncedSave({ delay: 800, onSave, onRevert }));
    expect(result.current.saveState).toBe('idle');
  });

  it('fires onSave after delay', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onRevert = vi.fn();
    const { result } = renderHook(() => useDebouncedSave({ delay: 800, onSave, onRevert }));

    act(() => { result.current.scheduleAutoSave('hello'); });
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(800); });

    expect(onSave).toHaveBeenCalledWith('hello');
    expect(result.current.saveState).toBe('saved');
  });

  it('only saves the latest value after multiple rapid calls', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onRevert = vi.fn();
    const { result } = renderHook(() => useDebouncedSave({ delay: 800, onSave, onRevert }));

    act(() => {
      result.current.scheduleAutoSave('a');
      result.current.scheduleAutoSave('b');
      result.current.scheduleAutoSave('c');
    });

    await act(async () => { vi.advanceTimersByTime(800); });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('c');
  });

  it('calls onRevert and sets error state when save fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('network'));
    const onRevert = vi.fn();
    const { result } = renderHook(() => useDebouncedSave({ delay: 800, onSave, onRevert }));

    act(() => { result.current.scheduleAutoSave('value'); });
    await act(async () => { vi.advanceTimersByTime(800); });

    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(result.current.saveState).toBe('error');
  });

  it('resets to idle 2s after saved', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onRevert = vi.fn();
    const { result } = renderHook(() => useDebouncedSave({ delay: 800, onSave, onRevert }));

    act(() => { result.current.scheduleAutoSave('hello'); });
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(result.current.saveState).toBe('saved');

    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(result.current.saveState).toBe('idle');
  });
});
