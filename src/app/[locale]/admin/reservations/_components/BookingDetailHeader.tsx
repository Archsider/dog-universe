'use client';

import { X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import type { BookingDetail } from '@/types/booking-detail';

interface BookingDetailHeaderProps {
  booking: BookingDetail;
  locale: string;
  currentIndex: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export default function BookingDetailHeader({
  booking,
  locale,
  currentIndex,
  total,
  hasPrev,
  hasNext,
  onClose,
  onPrev,
  onNext,
}: BookingDetailHeaderProps) {
  const fr = locale !== 'en';
  const clientName = booking.client.name ?? booking.client.email;
  const bookingRef = booking.id.slice(0, 8).toUpperCase();

  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-ivory-100 bg-white sticky top-0 z-10">
      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        aria-label={fr ? 'Fermer' : 'Close'}
        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-charcoal transition-colors flex-shrink-0"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Client + booking ref */}
      <div className="flex-1 min-w-0 text-center px-2">
        <p className="text-sm font-semibold text-charcoal truncate">{clientName}</p>
        <p className="text-xs text-gray-400">
          #{bookingRef}
          <a
            href={`/${locale}/admin/reservations/${booking.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1.5 inline-flex items-center text-amber-600 hover:underline"
            title={fr ? 'Ouvrir la fiche complète' : 'Open full detail page'}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>

      {/* Navigation */}
      {total > 1 && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onPrev}
            disabled={!hasPrev}
            aria-label={fr ? 'Précédent' : 'Previous'}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-charcoal disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-gray-400 tabular-nums w-10 text-center">
            {currentIndex + 1}&thinsp;/&thinsp;{total}
          </span>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            aria-label={fr ? 'Suivant' : 'Next'}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-charcoal disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
