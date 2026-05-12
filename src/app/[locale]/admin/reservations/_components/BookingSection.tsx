'use client';

import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const STORAGE_KEY = 'panel-sections';

function getPersistedSections(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, boolean>;
  } catch { return {}; }
}

function persistSection(id: string, open: boolean) {
  if (typeof window === 'undefined') return;
  try {
    const current = getPersistedSections();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, [id]: open }));
  } catch { /* ignore quota errors */ }
}

interface BookingSectionProps {
  id: string;
  title: string;
  /** Optional badge (count, label) shown next to title when collapsed. */
  badge?: ReactNode;
  children: ReactNode;
  /** Default open state (before localStorage override). Default true. */
  defaultOpen?: boolean;
}

/**
 * Collapsible section for the booking detail panel.
 * Open/closed state persisted in localStorage keyed by `id`.
 */
export default function BookingSection({
  id,
  title,
  badge,
  children,
  defaultOpen = true,
}: BookingSectionProps) {
  const [open, setOpen] = useState(() => {
    const persisted = getPersistedSections();
    return id in persisted ? persisted[id] : defaultOpen;
  });

  // Sync to localStorage on change
  useEffect(() => {
    persistSection(id, open);
  }, [id, open]);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <div className="border-b border-ivory-100 last:border-b-0">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-charcoal">
          {title}
          {badge && !open && <span className="text-xs font-normal text-gray-400">{badge}</span>}
        </span>
        <span className="text-gray-400 flex-shrink-0">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      <div
        style={{
          display: open ? undefined : 'none',
          // CSS transition handled by display:block removal/add is instant —
          // add max-height trick only if animated height is required.
        }}
      >
        <div className="px-6 pb-5">{children}</div>
      </div>
    </div>
  );
}
