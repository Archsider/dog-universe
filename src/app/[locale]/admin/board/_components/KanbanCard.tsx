'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { PawPrint, Car, Scissors, Loader2, Clock, Calendar } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import type { BookingCard } from '../_lib/types';
import { formatDateShortLocal, nightCount, getInitials } from '../_lib/format';
import { BOARDING_NEXT, TAXI_LABELS } from '../_lib/kanban-config';

export function KanbanCard({ b, locale, href }: { b: BookingCard; locale: string; href: string }) {
  const isFr = locale === 'fr';
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const nights = nightCount(b.startDate, b.endDate);
  const petLine = b.pets.map((p) => p.name).join(' · ');
  const firstPet = b.pets[0];
  const extraCount = Math.max(0, b.pets.length - 1);
  const hasTaxi = b.taxiGoEnabled || b.taxiReturnEnabled;
  const taxiBadgeLabel = b.taxiGoEnabled && b.taxiReturnEnabled
    ? (isFr ? 'Aller + Retour' : 'Go + Return')
    : b.taxiGoEnabled
    ? (isFr ? 'Aller' : 'Go')
    : (isFr ? 'Retour' : 'Return');
  const isCompleted = b.status === 'COMPLETED';
  const action = BOARDING_NEXT[b.status];

  const handleAction = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!action || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/bookings/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action.next, version: b.version }),
      });
      if (res.status === 409) {
        toast({
          title: isFr
            ? 'Cette réservation a été modifiée par quelqu\'un d\'autre. Veuillez rafraîchir.'
            : 'This record was modified by someone else. Please refresh.',
          variant: 'destructive',
        });
        return;
      }
      if (!res.ok) throw new Error('Failed');
      toast({ title: isFr ? 'Statut mis à jour' : 'Status updated', variant: 'success' });
      router.refresh();
    } catch {
      toast({ title: isFr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`bg-white border border-[rgba(196,151,74,0.12)] rounded-xl p-2 sm:p-3 lg:p-4 transition-all hover:shadow-[0_4px_12px_rgba(42,37,32,0.05)] hover:-translate-y-px ${isCompleted ? 'opacity-60' : ''}`}>
      <Link href={href} className="block">
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

        {/* Meta */}
        <div className="mt-2 sm:mt-2.5 flex items-center gap-2 sm:gap-3 text-[7px] sm:text-[8px] lg:text-[9px] text-[#8A7E75]">
          <span className="inline-flex items-center gap-1 truncate">
            <Calendar className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">
              {formatDateShortLocal(b.startDate, locale)}
              {b.serviceType === 'BOARDING' && b.endDate && ` → ${formatDateShortLocal(b.endDate, locale)}`}
            </span>
          </span>
          {b.serviceType === 'BOARDING' && nights > 0 && (
            <span className="inline-flex items-center gap-1 flex-shrink-0">
              <Clock className="h-3 w-3" />
              {nights} {isFr ? `nuit${nights > 1 ? 's' : ''}` : `night${nights > 1 ? 's' : ''}`}
            </span>
          )}
          {b.serviceType === 'PET_TAXI' && b.arrivalTime && (
            <span className="inline-flex items-center gap-1 flex-shrink-0">
              <Clock className="h-3 w-3" />
              {b.arrivalTime}
            </span>
          )}
        </div>

        {/* Footer: badges + price */}
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {b.includeGrooming && (
            <span className="inline-flex items-center gap-0.5 text-[6px] sm:text-[7px] lg:text-[8px] px-1.5 sm:px-2 lg:px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium">
              <Scissors className="h-2.5 w-2.5" />
              {isFr ? 'Toilettage' : 'Grooming'}
            </span>
          )}
          {hasTaxi && (
            <span className="inline-flex items-center gap-1 text-[6px] sm:text-[7px] lg:text-[8px] px-1.5 sm:px-2 lg:px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 font-medium">
              <Car className="h-2.5 w-2.5" />
              {taxiBadgeLabel}
            </span>
          )}
          {b.taxiType && (
            <span className="text-[6px] sm:text-[7px] lg:text-[8px] px-1.5 sm:px-2 lg:px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
              {TAXI_LABELS[b.taxiType]?.[locale] ?? b.taxiType}
            </span>
          )}
          <span className="ml-auto text-xs sm:text-sm lg:text-base font-bold text-[#C4974A]">{formatMAD(b.totalPrice)}</span>
        </div>
      </Link>

      {/* Bouton transition statut BOARDING */}
      {action && (
        <button
          type="button"
          onClick={handleAction}
          disabled={loading}
          className="w-full mt-2 py-2 flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium bg-white border border-[#C4974A] text-[#C4974A] hover:bg-[#C4974A] hover:text-white transition-all duration-200 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          <span className="truncate">{isFr ? action.labelFr : action.labelEn}</span>
        </button>
      )}
    </div>
  );
}
