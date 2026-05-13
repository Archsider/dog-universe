import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatMAD, getBookingStatusColor } from '@/lib/utils';
import DeleteBookingButton from '../DeleteBookingButton';
import type { LiveOpenEnded } from '../_lib/live-pricing';
import type { DetailLabels } from '../_lib/labels';

interface PendingExtensionBanner {
  id: string;
  endDate: Date | null;
}

interface OriginalBookingBanner {
  id: string;
  startDate: Date;
  endDate: Date | null;
}

interface Props {
  bookingId: string;
  bookingShortRef: string; // 8-char uppercase
  bookingStatus: string;
  bookingSource: string | null;
  bookingCreatedAt: Date;
  isPendingExtension: boolean;
  originalBooking: OriginalBookingBanner | null;
  pendingExtensionBooking: PendingExtensionBanner | null;
  liveOpenEnded: LiveOpenEnded | null;
  locale: string;
  labels: DetailLabels;
  statusLbl: string;
}

/**
 * Top section of the admin booking detail page:
 *   - Back-link + booking ref + status badge + source/extension pills
 *   - "Original booking" banner (when this is a pending extension)
 *   - "Pending extension" banner (when an extension exists for this booking)
 *   - Live "open-ended in progress" banner (when stay has no endDate yet)
 *
 * Three banners are mutually compatible — they stack in order of severity.
 */
export function BookingDetailHeader({
  bookingId,
  bookingShortRef,
  bookingStatus,
  bookingSource,
  bookingCreatedAt,
  isPendingExtension,
  originalBooking,
  pendingExtensionBooking,
  liveOpenEnded,
  locale,
  labels,
  statusLbl,
}: Props) {
  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/${locale}/admin/reservations`}
          className="text-gray-400 hover:text-charcoal"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-serif font-bold text-charcoal font-mono">
              {bookingShortRef}
            </h1>
            <Badge className={`${getBookingStatusColor(bookingStatus)}`}>{statusLbl}</Badge>
            {bookingSource === 'MANUAL' && (
              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                {locale === 'fr' ? 'Saisie manuelle' : 'Manual entry'}
              </span>
            )}
            {isPendingExtension && (
              <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
                {locale === 'fr' ? "Demande d'extension" : 'Extension request'}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">{formatDate(bookingCreatedAt, locale)}</p>
        </div>
        <DeleteBookingButton bookingId={bookingId} locale={locale} />
      </div>

      {isPendingExtension && originalBooking && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl text-sm">
          <span className="font-medium text-orange-800">{labels.originalBooking} :</span>
          <Link
            href={`/${locale}/admin/reservations/${originalBooking.id}`}
            className="font-mono font-bold text-orange-700 hover:underline flex items-center gap-1"
          >
            #{originalBooking.id.slice(0, 8).toUpperCase()}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <span className="text-gray-500">
            {formatDate(originalBooking.startDate, locale)}
            {originalBooking.endDate ? ` → ${formatDate(originalBooking.endDate, locale)}` : ''}
          </span>
        </div>
      )}

      {!isPendingExtension && pendingExtensionBooking && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <span className="font-medium text-amber-800">{labels.pendingExtension} :</span>
          <Link
            href={`/${locale}/admin/reservations/${pendingExtensionBooking.id}`}
            className="font-mono font-bold text-amber-700 hover:underline flex items-center gap-1"
          >
            #{pendingExtensionBooking.id.slice(0, 8).toUpperCase()}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          {pendingExtensionBooking.endDate && (
            <span className="text-gray-500">
              → {formatDate(pendingExtensionBooking.endDate, locale)}
            </span>
          )}
        </div>
      )}

      {liveOpenEnded && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                <span>⏳</span>
                {locale === 'en'
                  ? 'Open-ended stay in progress'
                  : 'Séjour ouvert en cours'}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {locale === 'en'
                  ? `Day ${liveOpenEnded.nights} — provisional total`
                  : `Jour ${liveOpenEnded.nights} — total provisoire`}{' '}
                <span className="font-bold text-amber-900">
                  {formatMAD(liveOpenEnded.total)}
                </span>
              </p>
              {liveOpenEnded.perPet.length > 1 && (
                <p className="text-xs text-amber-600 mt-0.5">
                  {liveOpenEnded.perPet
                    .map((p) => `${p.name} : ${formatMAD(p.price)}`)
                    .join(' · ')}
                </p>
              )}
            </div>
            <p className="text-xs text-amber-600 italic">
              {locale === 'en'
                ? 'Price locked at checkout using actual nights × pension rate.'
                : 'Prix figé à la clôture : nuits réelles × tarif pension.'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
