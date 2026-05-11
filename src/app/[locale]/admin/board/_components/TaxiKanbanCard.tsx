'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { PawPrint, Car, ArrowRight, Loader2, MapPin, Clock, Calendar } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { TaxiCard, TaxiStatusChangeHandler } from '../_lib/types';
import { formatDateShortLocal, getInitials, parseAddresses } from '../_lib/format';
import {
  TAXI_LABELS,
  RETOUR_FLOW, ALLER_FLOW,
  RETOUR_NEXT, ALLER_NEXT,
  RETOUR_ACTION_LABELS, ALLER_ACTION_LABELS,
} from '../_lib/kanban-config';
import { TaxiStepper } from './TaxiStepper';

export function TaxiKanbanCard({
  b,
  locale,
  onStatusChange,
}: {
  b: TaxiCard;
  locale: string;
  onStatusChange: TaxiStatusChangeHandler;
}) {
  const isFr = locale === 'fr';
  const [loading, setLoading] = useState(false);
  const isRetour = b._cardType === 'RETURN';
  const flow = isRetour ? RETOUR_FLOW : ALLER_FLOW;
  const nextStatus = (isRetour ? RETOUR_NEXT : ALLER_NEXT)[b._colStatus];
  const actionLabel = nextStatus ? (isRetour ? RETOUR_ACTION_LABELS : ALLER_ACTION_LABELS)[b._colStatus] : null;
  const { departure, arrival } = parseAddresses(b.notes);
  const petLine = b.pets.map((p) => p.name).join(' · ');
  const firstPet = b.pets[0];
  const extraCount = Math.max(0, b.pets.length - 1);
  const isTerminal = b._colStatus === 'ARRIVED_AT_PENSION' || b._colStatus === 'ARRIVED_AT_CLIENT';
  const taxiDate = b._cardType === 'GO'
    ? (b.taxiGoDate ?? b.startDate)
    : b._cardType === 'RETURN'
    ? (b.taxiReturnDate ?? b.startDate)
    : b.startDate;
  const taxiTime = b._cardType === 'GO' ? b.taxiGoTime : b._cardType === 'RETURN' ? b.taxiReturnTime : b.arrivalTime;

  const handleAction = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!nextStatus) return;
    setLoading(true);
    try {
      const tripId = b._cardType === 'GO'
        ? b.taxiGoTripId
        : b._cardType === 'RETURN'
        ? b.taxiReturnTripId
        : b.standaloneTripId;
      if (!tripId) throw new Error('No tripId');
      const res = await fetch(`/api/admin/taxi-trips/${tripId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      const field = b._cardType === 'GO' ? 'taxiGoStatus' : b._cardType === 'RETURN' ? 'taxiReturnStatus' : undefined;
      onStatusChange(b.id, nextStatus, field);
      toast({ title: isFr ? 'Statut mis à jour' : 'Status updated', variant: 'success' });
    } catch {
      toast({ title: isFr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`bg-white border border-[rgba(196,151,74,0.12)] rounded-xl p-2 sm:p-3 lg:p-4 transition-all hover:shadow-[0_4px_12px_rgba(42,37,32,0.05)] hover:-translate-y-px ${isTerminal ? 'opacity-60' : ''}`}>
      <Link href={`/${locale}/admin/reservations/${b.id}`} className="block">
        {/* Header: photo + client + pets */}
        <div className="flex items-start gap-2 sm:gap-3 lg:gap-4">
          <div className="relative w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-[10px] overflow-hidden bg-[#F5E6CC] flex items-center justify-center flex-shrink-0">
            {firstPet?.photoUrl ? (
              <Image src={firstPet.photoUrl} alt={firstPet.name} width={48} height={48} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[10px] sm:text-xs font-bold text-[#8B6A2F]">{getInitials(b.clientName)}</span>
            )}
            {extraCount > 0 && (
              <span className="absolute -bottom-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[#C4974A] text-white text-[9px] font-bold leading-none">
                +{extraCount}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm lg:text-base font-bold text-[#2A2520] truncate leading-tight">{b.clientName}</p>
            <p className="text-[8px] sm:text-[9px] lg:text-[10px] text-[#8B6A2F] mt-1 flex items-center gap-1 truncate">
              <PawPrint className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{petLine}</span>
            </p>
          </div>
        </div>

        {/* Addresses */}
        {(departure || arrival) && (
          <div className="mt-2 space-y-0.5">
            {departure && (
              <div className="flex items-start gap-1 text-[7px] sm:text-[8px] lg:text-[9px] text-[#8A7E75]">
                <MapPin className="h-3 w-3 flex-shrink-0 text-green-500 mt-px" />
                <span className="truncate">{departure}</span>
              </div>
            )}
            {arrival && (
              <div className="flex items-start gap-1 text-[7px] sm:text-[8px] lg:text-[9px] text-[#8A7E75]">
                <MapPin className="h-3 w-3 flex-shrink-0 text-red-400 mt-px" />
                <span className="truncate">{arrival}</span>
              </div>
            )}
          </div>
        )}

        {/* Meta */}
        <div className="mt-2 flex items-center gap-2 sm:gap-3 text-[7px] sm:text-[8px] lg:text-[9px] text-[#8A7E75]">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3 flex-shrink-0" />
            {formatDateShortLocal(taxiDate, locale)}
          </span>
          {taxiTime && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {taxiTime}
            </span>
          )}
        </div>

        {/* Badges */}
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {b.taxiType && (
            <span className="text-[6px] sm:text-[7px] lg:text-[8px] px-1.5 sm:px-2 lg:px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
              {TAXI_LABELS[b.taxiType]?.[locale] ?? b.taxiType}
            </span>
          )}
          {b._cardType && (
            <span className="inline-flex items-center gap-1 text-[6px] sm:text-[7px] lg:text-[8px] px-1.5 sm:px-2 lg:px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 font-medium">
              <Car className="h-2.5 w-2.5" />
              {b._cardType === 'GO' ? (isFr ? 'Aller' : 'Go') : (isFr ? 'Retour' : 'Return')}
            </span>
          )}
        </div>

        {/* Stepper progression — ronds */}
        <TaxiStepper flow={flow} currentStatus={b._colStatus} locale={locale} />
      </Link>
      {actionLabel && (
        <button
          onClick={handleAction}
          disabled={loading}
          className="mt-2.5 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] sm:text-xs lg:text-sm font-semibold bg-[#FEFCF9] text-[#C4974A] border border-[#C4974A]/50 hover:bg-[#C4974A] hover:text-white hover:border-[#C4974A] transition-all disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ArrowRight className="h-3 w-3 flex-shrink-0" />
          )}
          <span className="truncate">{isFr ? actionLabel.fr : actionLabel.en}</span>
        </button>
      )}
    </div>
  );
}
