'use client';

import { useCallback } from 'react';
import { toast } from '@/hooks/use-toast';
import { patchAdminBooking } from '@/lib/api-client';
import type { BookingStatus } from '@/lib/api-schemas/admin-booking-patch';
import { type KanbanBooking, type ApplyTransition } from './kanban-types';

/**
 * Returns an `applyTransition` function that:
 * 1. Optimistically updates bookings state
 * 2. PATCHes the API
 * 3. Rolls back on 409 or network error
 */
export function useKanbanTransition(
  setBookings: React.Dispatch<React.SetStateAction<KanbanBooking[]>>,
  locale: string,
): ApplyTransition {
  const isFr = locale === 'fr';

  const handleStatusChange = useCallback((id: string, newStatus: string) => {
    setBookings(prev =>
      prev.map(b => b.id === id ? { ...b, status: newStatus, version: b.version + 1 } : b)
    );
  }, [setBookings]);

  return useCallback<ApplyTransition>(async (bookingId, currentStatus, currentVersion, newStatus) => {
    handleStatusChange(bookingId, newStatus);
    try {
      const result = await patchAdminBooking(bookingId, {
        status: newStatus as BookingStatus,
        version: currentVersion,
      });
      if (!result.ok) {
        if (result.status === 409) {
          setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: currentStatus, version: currentVersion } : b));
          toast({
            title: isFr
              ? "Cette réservation a été modifiée par quelqu'un d'autre. Veuillez rafraîchir."
              : 'This record was modified by someone else. Please refresh.',
            variant: 'destructive',
          });
          return;
        }
        throw new Error(result.error.code);
      }
      toast({ title: isFr ? 'Statut mis à jour' : 'Status updated', variant: 'success' });
    } catch {
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: currentStatus, version: currentVersion } : b));
      toast({ title: isFr ? 'Erreur' : 'Error', variant: 'destructive' });
    }
  }, [handleStatusChange, setBookings, isFr]);
}
