'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { usePanelKeyboard } from '../_hooks/usePanelKeyboard';
import { useBookingNavigation } from '../_hooks/useBookingNavigation';
import { useFocusTrap } from '../_hooks/useFocusTrap';
import BookingDetailHeader from './BookingDetailHeader';
import BookingDetailContent from './BookingDetailContent';
import PanelSkeleton from './PanelSkeleton';
import KeyboardHints from './KeyboardHints';
import type { BookingDetail, BookingStatus } from '@/types/booking-detail';
import type { PricingSettings } from '@/lib/pricing-rules';

export interface BookingDetailPanelProps {
  /** Ordered list of booking IDs in the current visible list (for ↑↓ navigation). */
  orderedIds: string[];
  locale: string;
  pricing: PricingSettings;
  /** Optional: pre-fetched booking data (from SSR when ?booking= is in the initial URL). */
  initialData?: BookingDetail | null;
}

export default function BookingDetailPanel({
  orderedIds,
  locale,
  pricing,
  initialData,
}: BookingDetailPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const bookingId = searchParams.get('booking');
  const isOpen = !!bookingId;

  const [data, setData] = useState<BookingDetail | null>(initialData ?? null);
  const [loading, setLoading] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const firstEditRef = useRef<(() => void) | null>(null);

  const nav = useBookingNavigation({ orderedIds, currentId: bookingId });

  const containerRef = useFocusTrap(isOpen);

  // Prevent body scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
    }
    return () => { document.documentElement.style.overflow = ''; };
  }, [isOpen]);

  // Fetch booking data whenever the ID changes
  useEffect(() => {
    if (!bookingId) { setData(null); return; }

    // Use initialData if it matches (SSR hydration)
    if (initialData?.id === bookingId) {
      setData(initialData);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/bookings/${bookingId}/detail`)
      .then((r) => r.json() as Promise<BookingDetail>)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bookingId, initialData]);

  // Pre-fetch adjacent bookings in the background for instant navigation
  useEffect(() => {
    if (!isOpen) return;
    const ids = [nav.prevId, nav.nextId].filter(Boolean) as string[];
    ids.forEach((id) => {
      // Fire-and-forget prefetch using browser cache (no-cache would defeat purpose)
      void fetch(`/api/admin/bookings/${id}/detail`, { priority: 'low' } as RequestInit);
    });
  }, [isOpen, nav.prevId, nav.nextId]);

  const navigate = useCallback(
    (id: string | null) => {
      if (!id) return;
      const next = new URLSearchParams(searchParams.toString());
      next.set('booking', id);
      router.replace(`${pathname}?${next.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const close = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('booking');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [router, pathname, searchParams]);

  const handleStatusChange = useCallback((newStatus: BookingStatus) => {
    setData((prev) => prev ? { ...prev, status: newStatus, version: prev.version + 1 } : prev);
  }, []);

  const keyboardCallbacks = useMemo(() => ({
    onClose: close,
    onPrev: () => navigate(nav.prevId),
    onNext: () => navigate(nav.nextId),
    onFocusEdit: () => {
      const field = containerRef.current?.querySelector<HTMLTextAreaElement>('[data-inline-edit-field] textarea');
      field?.focus();
    },
    onShowHints: () => setShowHints((v) => !v),
  }), [close, navigate, nav.prevId, nav.nextId, containerRef]);

  usePanelKeyboard(isOpen, keyboardCallbacks);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        style={{ transition: 'opacity 200ms ease-out' }}
        onClick={close}
        aria-hidden
      />

      {/* Panel */}
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={locale !== 'en' ? 'Détail réservation' : 'Booking detail'}
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-white shadow-2xl"
        style={{
          width: 'min(720px, 100vw)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 200ms ease-out',
          overflowY: 'hidden',
        }}
      >
        {data ? (
          <>
            <BookingDetailHeader
              booking={data}
              locale={locale}
              currentIndex={nav.currentIndex}
              total={nav.total}
              hasPrev={nav.hasPrev}
              hasNext={nav.hasNext}
              onClose={close}
              onPrev={() => navigate(nav.prevId)}
              onNext={() => navigate(nav.nextId)}
            />
            <div className="flex-1 overflow-hidden flex flex-col" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 100ms' }}>
              {loading ? (
                <PanelSkeleton />
              ) : (
                <BookingDetailContent
                  booking={data}
                  pricing={pricing}
                  locale={locale}
                  onStatusChange={handleStatusChange}
                  firstEditRef={firstEditRef}
                />
              )}
            </div>
          </>
        ) : (
          <PanelSkeleton />
        )}
      </div>

      {/* Keyboard hints overlay */}
      {showHints && (
        <KeyboardHints locale={locale} onClose={() => setShowHints(false)} />
      )}
    </>
  );
}
