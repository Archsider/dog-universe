'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowRight, Settings2, Check, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  booking: { id: string; status: string; serviceType: string };
  locale: string;
}

// Transitions linéaires par pipeline
const NEXT_STATUS: Record<string, string> = {
  PENDING:     'CONFIRMED',
  CONFIRMED:   'AT_PICKUP',
  AT_PICKUP:   'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
};

// Pour le boarding, CONFIRMED → IN_PROGRESS directement (pas d'AT_PICKUP)
const BOARDING_NEXT_STATUS: Record<string, string> = {
  PENDING:     'CONFIRMED',
  CONFIRMED:   'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
};

const ACTION_LABELS: Record<string, Record<string, { fr: string; en: string }>> = {
  BOARDING: {
    PENDING:     { fr: 'Confirmer le séjour',           en: 'Confirm stay' },
    CONFIRMED:   { fr: 'Marquer "Dans nos murs"',        en: 'Mark as currently staying' },
    IN_PROGRESS: { fr: 'Clôturer le séjour',             en: 'Close stay' },
  },
  PET_TAXI: {
    PENDING:     { fr: 'Mettre le véhicule en route',     en: 'Vehicle en route to pickup' },
    CONFIRMED:   { fr: 'Véhicule sur place',             en: 'Vehicle on site' },
    AT_PICKUP:   { fr: 'Marquer animal à bord',          en: 'Mark pet on board' },
    IN_PROGRESS: { fr: 'Marquer arrivé à destination',   en: 'Mark arrived' },
  },
};

const STATUS_LABELS: Record<string, { fr: string; en: string }> = {
  PENDING:           { fr: 'En attente',              en: 'Pending' },
  CONFIRMED:         { fr: 'Confirmé',                en: 'Confirmed' },
  AT_PICKUP:         { fr: 'Véhicule sur place',       en: 'Vehicle on site' },
  IN_PROGRESS:       { fr: 'En cours',                en: 'In progress' },
  COMPLETED:         { fr: 'Terminé',                 en: 'Completed' },
  CANCELLED:         { fr: 'Annulé',                  en: 'Cancelled' },
  REJECTED:          { fr: 'Refusé',                  en: 'Rejected' },
  PENDING_EXTENSION: { fr: 'Extension en attente',    en: 'Extension pending' },
};

export default function ReservationActions({ booking, locale }: Props) {
  const [currentStatus, setCurrentStatus] = useState(booking.status);
  const [forceStatus, setForceStatus] = useState(booking.status);
  const [loadingNext, setLoadingNext] = useState(false);
  const [loadingForce, setLoadingForce] = useState(false);
  const [loadingApprove, setLoadingApprove] = useState(false);
  const [loadingReject, setLoadingReject] = useState(false);
  const [showForce, setShowForce] = useState(false);
  const router = useRouter();
  const isFr = locale === 'fr';

  const pipeline = booking.serviceType === 'PET_TAXI' ? 'PET_TAXI' : 'BOARDING';
  const nextStatusMap = pipeline === 'PET_TAXI' ? NEXT_STATUS : BOARDING_NEXT_STATUS;
  const nextStatus = nextStatusMap[currentStatus];
  const actionLabel = nextStatus ? ACTION_LABELS[pipeline]?.[currentStatus] : null;
  const isPendingExtension = currentStatus === 'PENDING_EXTENSION';

  const patchStatus = async (status: string, setLoading: (v: boolean) => void) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed');
      setCurrentStatus(status);
      setForceStatus(status);
      toast({ title: isFr ? 'Statut mis à jour' : 'Status updated', variant: 'success' });
      router.refresh();
    } catch {
      toast({ title: isFr ? 'Erreur lors de la mise à jour' : 'Update error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Approve PENDING_EXTENSION booking — triggers merge with original booking
  const handleApproveExtension = async () => {
    setLoadingApprove(true);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approveExtension: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? (isFr ? 'Erreur lors de l\'approbation' : 'Approval error'), variant: 'destructive' });
        return;
      }
      toast({ title: isFr ? 'Extension approuvée — réservations fusionnées.' : 'Extension approved — bookings merged.' });
      // Redirect to the original booking
      if (data.originalBookingId) {
        router.push(`/${locale}/admin/reservations/${data.originalBookingId}`);
      } else {
        router.push(`/${locale}/admin/reservations`);
      }
    } catch {
      toast({ title: isFr ? 'Erreur lors de l\'approbation' : 'Approval error', variant: 'destructive' });
    } finally {
      setLoadingApprove(false);
    }
  };

  // Reject PENDING_EXTENSION booking — deletes it
  const handleRejectExtension = async () => {
    setLoadingReject(true);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectExtension: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? (isFr ? 'Erreur lors du refus' : 'Rejection error'), variant: 'destructive' });
        return;
      }
      toast({ title: isFr ? 'Extension refusée.' : 'Extension rejected.' });
      if (data.originalBookingId) {
        router.push(`/${locale}/admin/reservations/${data.originalBookingId}`);
      } else {
        router.push(`/${locale}/admin/reservations`);
      }
    } catch {
      toast({ title: isFr ? 'Erreur lors du refus' : 'Rejection error', variant: 'destructive' });
    } finally {
      setLoadingReject(false);
    }
  };

  // PENDING_EXTENSION: special approve/reject UI
  if (isPendingExtension) {
    return (
      <div className="bg-white rounded-xl border border-orange-200 p-5 shadow-card space-y-4">
        <h3 className="font-semibold text-orange-700 text-sm">
          {isFr ? 'Demande d\'extension' : 'Extension request'}
        </h3>
        <p className="text-xs text-gray-500">
          {isFr
            ? 'Cette réservation est une demande d\'extension en attente de validation. L\'approbation fusionnera automatiquement les deux réservations et mettra à jour la facture.'
            : 'This booking is a pending extension request. Approval will automatically merge the two bookings and update the invoice.'}
        </p>
        <div className="flex gap-2">
          <Button
            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            disabled={loadingApprove || loadingReject}
            onClick={handleApproveExtension}
          >
            {loadingApprove ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            {isFr ? 'Approuver' : 'Approve'}
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
            disabled={loadingApprove || loadingReject}
            onClick={handleRejectExtension}
          >
            {loadingReject ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <X className="h-4 w-4 mr-2" />
            )}
            {isFr ? 'Refuser' : 'Reject'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card space-y-4">
      <h3 className="font-semibold text-charcoal text-sm">
        {isFr ? 'Avancement du statut' : 'Status progression'}
      </h3>

      {/* Bouton d'action principal (prochaine étape) */}
      {actionLabel ? (
        <Button
          onClick={() => patchStatus(nextStatus, setLoadingNext)}
          disabled={loadingNext}
          className="w-full flex items-center gap-2 bg-charcoal hover:bg-charcoal/90 text-white"
        >
          {loadingNext ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          {isFr ? actionLabel.fr : actionLabel.en}
        </Button>
      ) : (
        <p className="text-xs text-gray-400 text-center py-1">
          {currentStatus === 'COMPLETED'
            ? (isFr ? 'Séjour terminé — aucune action disponible' : 'Stay completed — no further action')
            : (isFr ? 'Statut final atteint' : 'Final status reached')}
        </p>
      )}

      {/* Section forçage manuel (secondaire) */}
      <div>
        <button
          onClick={() => setShowForce(v => !v)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <Settings2 className="h-3.5 w-3.5" />
          {isFr ? 'Forcer un statut manuellement' : 'Force status manually'}
        </button>

        {showForce && (
          <div className="flex gap-2 mt-2">
            <Select value={forceStatus} onValueChange={setForceStatus}>
              <SelectTrigger className="flex-1 text-sm h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).map(([s, labels]) => (
                  <SelectItem key={s} value={s}>
                    {isFr ? labels.fr : labels.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => patchStatus(forceStatus, setLoadingForce)}
              disabled={loadingForce || forceStatus === currentStatus}
              className="h-9 px-3"
            >
              {loadingForce ? <Loader2 className="h-4 w-4 animate-spin" /> : (isFr ? 'Appliquer' : 'Apply')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
