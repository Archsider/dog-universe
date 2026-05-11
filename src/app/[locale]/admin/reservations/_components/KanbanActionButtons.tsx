'use client';

import { useState, Component, type ReactNode } from 'react';
import { Loader2, ArrowRight, UserX } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ACTION_LABELS,
  BOARDING_NEXT_STATUS,
  TAXI_NEXT_STATUS,
  NO_SHOW_ELIGIBLE_STATUSES,
  type ApplyTransition,
} from '../_lib/kanban-types';

// Error boundary — catches dnd-kit DOM crashes (Android Chrome / React 19 hydration)
export class KanbanErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { crashed: boolean }
> {
  state = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  render() { return this.state.crashed ? this.props.fallback : this.props.children; }
}

export function ActionButton({
  bookingId,
  bookingVersion,
  currentStatus,
  pipeline,
  locale,
  applyTransition,
}: {
  bookingId: string;
  bookingVersion: number;
  currentStatus: string;
  pipeline: 'BOARDING' | 'PET_TAXI';
  locale: string;
  applyTransition: ApplyTransition;
}) {
  const [loading, setLoading] = useState(false);
  const nextStatusMap = pipeline === 'BOARDING' ? BOARDING_NEXT_STATUS : TAXI_NEXT_STATUS;
  const nextStatus = nextStatusMap[currentStatus];
  const actionLabels = ACTION_LABELS[pipeline][currentStatus];
  if (!nextStatus || !actionLabels) return null;

  const label = locale === 'fr' ? actionLabels.fr : actionLabels.en;

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      await applyTransition(bookingId, currentStatus, bookingVersion, nextStatus);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={loading}
      className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium bg-charcoal/5 hover:bg-charcoal/10 text-charcoal border border-charcoal/10 hover:border-charcoal/20 transition-all disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <ArrowRight className="h-3 w-3 flex-shrink-0" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}

export function NoShowButton({
  bookingId,
  bookingVersion,
  currentStatus,
  locale,
  applyTransition,
}: {
  bookingId: string;
  bookingVersion: number;
  currentStatus: string;
  locale: string;
  applyTransition: ApplyTransition;
}) {
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!NO_SHOW_ELIGIBLE_STATUSES.has(currentStatus)) return null;

  const isFr = locale === 'fr';

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await applyTransition(bookingId, currentStatus, bookingVersion, 'NO_SHOW');
    } finally {
      setLoading(false);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmOpen(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={loading}
        className="mt-1.5 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 hover:border-red-300 transition-all disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <UserX className="h-3 w-3 flex-shrink-0" />
        )}
        <span>No Show</span>
      </button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isFr ? 'Confirmer le No Show' : 'Confirm No Show'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isFr
                ? "Marquer cette réservation comme No Show ? Cette action libère la place et ne compte pas dans les séjours du client."
                : "Mark this booking as No Show? This frees the slot and is not counted toward the client's stays."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmOpen(false)}>
              {isFr ? 'Annuler' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                handleConfirm();
              }}
            >
              {isFr ? 'Confirmer' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
