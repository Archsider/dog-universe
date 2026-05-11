import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate, getBookingStatusColor } from '@/lib/utils';
import CancelBookingButton from '../../../history/CancelBookingButton';
import RescheduleBookingButton from '../RescheduleBookingButton';
import type { BookingDetailTranslations } from '../_lib/i18n';

interface BookingHeaderProps {
  bookingId: string;
  bookingCreatedAt: Date;
  bookingStatus: string;
  serviceType: 'BOARDING' | 'PET_TAXI';
  species: 'DOG' | 'CAT' | null;
  startDate: string;
  endDate: string | null;
  canCancel: boolean;
  statusLabel: string;
  locale: string;
  t: BookingDetailTranslations;
}

export default function BookingHeader({
  bookingId,
  bookingCreatedAt,
  bookingStatus,
  serviceType,
  species,
  startDate,
  endDate,
  canCancel,
  statusLabel,
  locale,
}: BookingHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <Link href={`/${locale}/client/history`} className="text-gray-400 hover:text-charcoal transition-colors">
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="font-mono font-bold text-charcoal text-lg">{bookingId.slice(0, 8).toUpperCase()}</h1>
          <Badge className={getBookingStatusColor(bookingStatus)}>
            {statusLabel}
          </Badge>
        </div>
        <p className="text-xs text-gray-400">{formatDate(bookingCreatedAt, locale)}</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {canCancel && (
          <RescheduleBookingButton
            bookingId={bookingId}
            serviceType={serviceType}
            species={species}
            currentStart={startDate}
            currentEnd={endDate}
            locale={locale}
          />
        )}
        {canCancel && <CancelBookingButton bookingId={bookingId} locale={locale} />}
      </div>
    </div>
  );
}
