import Link from 'next/link';
import { AlertCircle, CalendarOff } from 'lucide-react';

interface Props {
  locale: string;
  pendingBookings: number;
  petsWithoutDob: number;
}

/**
 * Top-of-dashboard amber alert banners. Each is a click-through Link that
 * filters the relevant page so the operator can act on the count.
 *
 * Hidden when count = 0 — the dashboard layout collapses cleanly.
 */
export function AlertBanners({ locale, pendingBookings, petsWithoutDob }: Props) {
  return (
    <>
      {pendingBookings > 0 && (
        <Link href={`/${locale}/admin/reservations?status=PENDING`}>
          <div className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 hover:bg-amber-100 transition-colors cursor-pointer">
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <span className="text-amber-700 font-medium">
              {pendingBookings}{' '}
              {locale === 'fr'
                ? `réservation${pendingBookings > 1 ? 's' : ''} en attente de confirmation`
                : `booking${pendingBookings > 1 ? 's' : ''} pending confirmation`}
            </span>
          </div>
        </Link>
      )}

      {petsWithoutDob > 0 && (
        <Link href={`/${locale}/admin/animals?missingDob=true`}>
          <div className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 hover:bg-amber-100 transition-colors cursor-pointer">
            <CalendarOff className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <span className="text-amber-700 font-medium">
              {petsWithoutDob}{' '}
              {locale === 'fr'
                ? `animal${petsWithoutDob > 1 ? 'aux' : ''} sans date de naissance — affecter les anniversaires`
                : `pet${petsWithoutDob > 1 ? 's' : ''} without date of birth — assign birthdays`}
            </span>
          </div>
        </Link>
      )}
    </>
  );
}
