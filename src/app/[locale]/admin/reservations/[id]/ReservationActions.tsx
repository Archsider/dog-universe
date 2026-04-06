'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowRight, Settings2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  booking: { id: string; status: string; serviceType: string };
  locale: string;
}

// Transitions linéaires par pipeline
const NEXT_STATUS: Record<string, string> = {
  PENDING: 'CONFIRMED',
  CONFIRMED: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
};

const ACTION_LABELS: Record<string, Record<string, { fr: string; en: string }>> = {
  BOARDING: {
    PENDING:     { fr: 'Confirmer le séjour',           en: 'Confirm stay' },
    CONFIRMED:   { fr: 'Marquer "Dans nos murs"',        en: 'Mark as currently staying' },
    IN_PROGRESS: { fr: 'Clôturer le séjour',             en: 'Close stay' },
  },
  PET_TAXI: {
    PENDING:     { fr: 'Mettre le chauffeur en route',   en: 'Driver en route' },
    CONFIRMED:   { fr: 'Marquer animal à bord',          en: 'Mark pet on board' },
    IN_PROGRESS: { fr: 'Marquer arrivé à destination',   en: 'Mark arrived' },
  },
};

const STATUS_LABELS: Record<string, { fr: string; en: string }> = {
  PENDING:     { fr: 'En attente',  en: 'Pending' },
  CONFIRMED:   { fr: 'Confirmé',   en: 'Confirmed' },
  IN_PROGRESS: { fr: 'En cours',   en: 'In progress' },
  COMPLETED:   { fr: 'Terminé',    en: 'Completed' },
  CANCELLED:   { fr: 'Annulé',     en: 'Cancelled' },
  REJECTED:    { fr: 'Refusé',     en: 'Rejected' },
};

export default function ReservationActions({ booking, locale }: Props) {
  const [currentStatus, setCurrentStatus] = useState(booking.status);
  const [forceStatus, setForceStatus] = useState(booking.status);
  const [loadingNext, setLoadingNext] = useState(false);
  const [loadingForce, setLoadingForce] = useState(false);
  const [showForce, setShowForce] = useState(false);
  const router = useRouter();
  const isFr = locale === 'fr';

  const pipeline = booking.serviceType === 'PET_TAXI' ? 'PET_TAXI' : 'BOARDING';
  const nextStatus = NEXT_STATUS[currentStatus];
  const actionLabel = nextStatus ? ACTION_LABELS[pipeline]?.[currentStatus] : null;

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
