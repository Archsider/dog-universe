'use client';

import { useState, useCallback } from 'react';

export type ToastVariant = 'default' | 'destructive' | 'success';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  toast: (opts: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

// Global toast state (simple singleton pattern)
let toastListeners: Array<(toasts: Toast[]) => void> = [];
let currentToasts: Toast[] = [];

function notifyListeners() {
  toastListeners.forEach((listener) => listener([...currentToasts]));
}

function addToast(opts: Omit<Toast, 'id'>) {
  const id = Math.random().toString(36).slice(2);
  const toast: Toast = { ...opts, id };
  currentToasts = [...currentToasts, toast];
  notifyListeners();

  const duration = opts.duration ?? 4000;
  setTimeout(() => {
    removeToast(id);
  }, duration);
}

function removeToast(id: string) {
  currentToasts = currentToasts.filter((t) => t.id !== id);
  notifyListeners();
}

export function useToast(): ToastState {
  const [toasts, setToasts] = useState<Toast[]>(currentToasts);

  const listener = useCallback((updated: Toast[]) => {
    setToasts(updated);
  }, []);

  // Subscribe on mount
  if (!toastListeners.includes(listener)) {
    toastListeners.push(listener);
  }

  return {
    toasts,
    toast: addToast,
    dismissToast: removeToast,
  };
}

// Standalone toast function for use outside of components
export const toast = (opts: Omit<Toast, 'id'>) => addToast(opts);
