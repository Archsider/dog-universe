'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GitMerge, ChevronDown, ChevronUp, Zap } from 'lucide-react';
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
    description: 'Fusionner deux réservations contiguës en une seule (1 résa + 1 facture mise à jour).',
    noAdjacent: 'Aucune réservation adjacente trouvée pour ce client.',
    before: 'Précède cette réservation',
    after: 'Suite de cette réservation',
    merge: 'Fusionner',
    forceMerge: 'Forcer le merge',
    forceMergeDesc: 'Bypass de la validation des dates — résultat identique.',
    merging: 'Fusion…',
    confirmTitle: 'Confirmer la fusion',
    confirmDesc: 'Cette action est irréversible. La réservation absorbée sera supprimée et la facture mise à jour.',
    confirm: 'Confirmer',
    cancel: 'Annuler',
    successMsg: 'Réservations fusionnées avec succès.',
    nights: 'nuit(s)',
    errorDates: 'Les dates ne sont pas contiguës. Utilisez "Forcer le merge" pour bypasser cette validation.',
  },
  en: {
    title: 'Merge bookings',
    description: 'Merge two contiguous bookings into one (1 booking + updated invoice).',
    noAdjacent: 'No adjacent bookings found for this client.',
    before: 'Precedes this booking',
    after: 'Follows this booking',
    merge: 'Merge',
    forceMerge: 'Force merge',
    forceMergeDesc: 'Bypass date validation — same result.',
    merging: 'Merging…',
    confirmTitle: 'Confirm merge',
    confirmDesc: 'This action is irreversible. The absorbed booking will be deleted and the invoice updated.',
    confirm: 'Confirm',
    cancel: 'Cancel',
    successMsg: 'Bookings merged successfully.',
    nights: 'night(s)',
    errorDates: 'Dates are not contiguous. Use "Force merge" to bypass this validation.',
  },
};

const STATUS_LABELS: Record<string, Record<string, string>> = {
  fr: { PENDING: 'En attente', CONFIRMED: 'Confirmé', AT_PICKUP: 'Sur place', IN_PROGRESS: 'En cours', COMPLETED: 'Terminé', CANCELLED: 'Annulé', REJECTED: 'Refusé', PENDING_EXTENSION: 'Extension en attente' },
  en: { PENDING: 'Pending', CONFIRMED: 'Confirmed', AT_PICKUP: 'At pickup', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled', REJECTED: 'Rejected', PENDING_EXTENSION: 'Extension pending' },
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
  const [forceId, setForceId] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  async function handleMerge(otherBookingId: string, force = false) {
    setLoading(true);
    setDateError(null);
    try {
      const res = await fetch('/api/admin/bookings/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetBookingId: booking.id,
          sourceBookingId: otherBookingId,
          force,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'DATES_NOT_CONTIGUOUS') {
          setDateError(t.errorDates);
        } else {
          const errorMessages: Record<string, string> = {
            MERGE_BOARDING_ONLY: locale === 'fr'
              ? 'La fusion ne s\'applique qu\'aux séjours pension.'
              : 'Merge only applies to boarding stays.',
            DIFFERENT_CLIENTS: locale === 'fr' ? 'Réservations de clients différents.' : 'Different clients.',
            BOOKING_NOT_MERGEABLE: locale === 'fr' ? 'L\'une des réservations est annulée/refusée.' : 'One booking is cancelled/rejected.',
            TARGET_NO_END_DATE: locale === 'fr' ? 'La réservation cible n\'a pas de date de fin.' : 'Target booking has no end date.',
          };
          toast({
            title: errorMessages[data.error] ?? (data.error || 'Erreur'),
            variant: 'destructive',
          });
        }
        return;
      }
      toast({ title: t.successMsg });
      setConfirmId(null);
      setForceId(null);
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
                const isForcing = forceId === adj.id;
                const showDateError = dateError && (confirmId === adj.id || forceId === adj.id);

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
                        <p className="text-xs text-gray-400">{statusLbls[adj.status] ?? adj.status}</p>
                      </div>
                    </div>

                    {showDateError && (
                      <div className="rounded-md bg-orange-50 border border-orange-200 p-2 text-xs text-orange-800">
                        {dateError}
                      </div>
                    )}

                    {isForcing ? (
                      <div className="rounded-md bg-red-50 border border-red-200 p-2 space-y-2">
                        <p className="text-xs font-semibold text-red-800">{t.confirmTitle} (force)</p>
                        <p className="text-xs text-red-700">{t.confirmDesc}</p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-red-600 hover:bg-red-700 text-white text-xs h-7"
                            disabled={loading}
                            onClick={() => handleMerge(adj.id, true)}
                          >
                            {loading ? t.merging : t.confirm}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            disabled={loading}
                            onClick={() => { setForceId(null); setDateError(null); }}
                          >
                            {t.cancel}
                          </Button>
                        </div>
                      </div>
                    ) : isConfirming ? (
                      <div className="rounded-md bg-amber-50 border border-amber-200 p-2 space-y-2">
                        <p className="text-xs font-semibold text-amber-800">{t.confirmTitle}</p>
                        <p className="text-xs text-amber-700">{t.confirmDesc}</p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-charcoal hover:bg-charcoal/90 text-white text-xs h-7"
                            disabled={loading}
                            onClick={() => handleMerge(adj.id, false)}
                          >
                            {loading ? t.merging : t.confirm}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            disabled={loading}
                            onClick={() => { setConfirmId(null); setDateError(null); }}
                          >
                            {t.cancel}
                          </Button>
                        </div>
                        {/* Show "Force merge" option after a date error */}
                        {dateError && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-200 text-red-600 hover:bg-red-50 text-xs h-7 mt-1"
                            disabled={loading}
                            onClick={() => { setConfirmId(null); setForceId(adj.id); setDateError(null); }}
                          >
                            <Zap className="h-3 w-3 mr-1" />
                            {t.forceMerge}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-gold-300 text-gold-700 hover:bg-gold-50 text-xs h-7"
                          onClick={() => { setConfirmId(adj.id); setDateError(null); }}
                        >
                          <GitMerge className="h-3 w-3 mr-1" />
                          {t.merge}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-600 hover:bg-red-50 text-xs h-7"
                          title={t.forceMergeDesc}
                          onClick={() => { setForceId(adj.id); setDateError(null); }}
                        >
                          <Zap className="h-3 w-3 mr-1" />
                          {t.forceMerge}
                        </Button>
                      </div>
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
