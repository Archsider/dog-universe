'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GitMerge, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { formatDate, formatMAD } from '@/lib/utils';

interface AdjacentBooking {
  id: string;
  startDate: Date;
  endDate: Date | null;
  totalPrice: number;
  status: string;
  pets: string;
  relation: 'before' | 'after'; // relative to current booking
}

interface MergeBookingsSectionProps {
  booking: { id: string };
  adjacentBookings: AdjacentBooking[];
  locale: string;
}

const l = {
  fr: {
    title: 'Fusionner des réservations',
    description: 'Fusionner deux réservations contiguës en une seule (1 résa + 1 facture).',
    noAdjacent: 'Aucune réservation adjacente trouvée pour ce client.',
    before: 'Précède cette réservation',
    after: 'Suite de cette réservation',
    merge: 'Fusionner',
    merging: 'Fusion…',
    confirmTitle: 'Confirmer la fusion',
    confirmDesc: 'Cette action est irréversible. La réservation absorbée sera supprimée.',
    confirm: 'Confirmer',
    cancel: 'Annuler',
    successMsg: 'Réservations fusionnées avec succès.',
    nights: 'nuit(s)',
  },
  en: {
    title: 'Merge bookings',
    description: 'Merge two contiguous bookings into one (1 booking + 1 invoice).',
    noAdjacent: 'No adjacent bookings found for this client.',
    before: 'Precedes this booking',
    after: 'Follows this booking',
    merge: 'Merge',
    merging: 'Merging…',
    confirmTitle: 'Confirm merge',
    confirmDesc: 'This action is irreversible. The absorbed booking will be deleted.',
    confirm: 'Confirm',
    cancel: 'Cancel',
    successMsg: 'Bookings merged successfully.',
    nights: 'night(s)',
  },
};

const STATUS_LABELS: Record<string, Record<string, string>> = {
  fr: { PENDING: 'En attente', CONFIRMED: 'Confirmé', IN_PROGRESS: 'En cours', COMPLETED: 'Terminé', CANCELLED: 'Annulé', REJECTED: 'Refusé' },
  en: { PENDING: 'Pending', CONFIRMED: 'Confirmed', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled', REJECTED: 'Rejected' },
};

export default function MergeBookingsSection({
  booking,
  adjacentBookings,
  locale,
}: MergeBookingsSectionProps) {
  const router = useRouter();
  const t = l[locale as keyof typeof l] || l.fr;
  const statusLbls = STATUS_LABELS[locale] || STATUS_LABELS.fr;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleMerge(otherBookingId: string) {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/bookings/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetBookingId: booking.id,
          sourceBookingId: otherBookingId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMessages: Record<string, string> = {
          DATES_NOT_CONTIGUOUS: locale === 'fr'
            ? 'Les dates doivent être contiguës (pas de gap ni chevauchement).'
            : 'Dates must be contiguous (no gap or overlap).',
          MERGE_BOARDING_ONLY: locale === 'fr'
            ? 'La fusion ne s\'applique qu\'aux séjours pension.'
            : 'Merge only applies to boarding stays.',
          DIFFERENT_CLIENTS: locale === 'fr' ? 'Réservations de clients différents.' : 'Different clients.',
          BOOKING_NOT_MERGEABLE: locale === 'fr' ? 'L\'une des réservations est annulée/refusée.' : 'One booking is cancelled/rejected.',
        };
        toast({
          title: errorMessages[data.error] ?? (data.error || 'Erreur'),
          variant: 'destructive',
        });
        return;
      }
      toast({ title: t.successMsg });
      setConfirmId(null);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card space-y-3">
      <button
        className="flex items-center justify-between w-full"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-gold-500" />
          <h3 className="font-semibold text-charcoal text-sm">{t.title}</h3>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {open && (
        <div className="space-y-3 pt-1">
          <p className="text-xs text-gray-500">{t.description}</p>

          {adjacentBookings.length === 0 ? (
            <p className="text-sm text-gray-400 italic">{t.noAdjacent}</p>
          ) : (
            <div className="space-y-2">
              {adjacentBookings.map(adj => {
                const nights = adj.endDate
                  ? Math.floor((adj.endDate.getTime() - adj.startDate.getTime()) / (1000 * 60 * 60 * 24))
                  : null;
                const isConfirming = confirmId === adj.id;

                return (
                  <div
                    key={adj.id}
                    className="rounded-lg border border-ivory-200 bg-ivory-50 p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                          {adj.relation === 'before' ? t.before : t.after}
                        </p>
                        <p className="font-mono text-xs text-charcoal font-bold">
                          #{adj.id.slice(0, 8).toUpperCase()}
                        </p>
                        <p className="text-xs text-gray-600">
                          {formatDate(adj.startDate, locale)}
                          {adj.endDate ? ` → ${formatDate(adj.endDate, locale)}` : ''}
                          {nights !== null && (
                            <span className="text-gray-400 ml-1">({nights} {t.nights})</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">{adj.pets}</p>
                        <p className="text-xs font-medium text-charcoal">{formatMAD(adj.totalPrice)}</p>
                        <p className="text-xs text-gray-400">{statusLbls[adj.status]}</p>
                      </div>
                    </div>

                    {isConfirming ? (
                      <div className="rounded-md bg-amber-50 border border-amber-200 p-2 space-y-2">
                        <p className="text-xs font-semibold text-amber-800">{t.confirmTitle}</p>
                        <p className="text-xs text-amber-700">{t.confirmDesc}</p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-charcoal hover:bg-charcoal/90 text-white text-xs h-7"
                            disabled={loading}
                            onClick={() => handleMerge(adj.id)}
                          >
                            {loading ? t.merging : t.confirm}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            disabled={loading}
                            onClick={() => setConfirmId(null)}
                          >
                            {t.cancel}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-gold-300 text-gold-700 hover:bg-gold-50 text-xs h-7"
                        onClick={() => setConfirmId(adj.id)}
                      >
                        <GitMerge className="h-3 w-3 mr-1" />
                        {t.merge}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
