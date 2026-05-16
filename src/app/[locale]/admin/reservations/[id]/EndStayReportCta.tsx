/* eslint-disable dog-universe/no-getmonth-on-date-casa --
 * OK: client-side UI / calendar grid helpers. These operate either on
 * <input type="date"> values (already local-time) or on (year, month, day)
 * primitives previously extracted via casablancaYMD upstream. The Vercel UTC
 * runtime is not in scope here — the browser is.
 */
// End-of-stay report CTA — small banner with a button that links to the
// dedicated `/end-report` page. Gating rule (matches the spec) :
//
//   visible if status === 'COMPLETED'
//          OR (status === 'IN_PROGRESS' AND endDate <= today+1)
//
// The button is rendered server-side (no `'use client'`) so we don't ship
// a Client Component just to host a Link. The end-report page itself is
// where the heavy interactive form lives.

import Link from 'next/link';
import { FileText, ChevronRight } from 'lucide-react';

interface Props {
  bookingId: string;
  locale: string;
  status: string;
  endDate: string | null;
}

function shouldShow(status: string, endDate: string | null): boolean {
  if (status === 'COMPLETED') return true;
  if (status === 'IN_PROGRESS' && endDate) {
    const end = new Date(endDate);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 1);
    return end.getTime() <= cutoff.getTime();
  }
  return false;
}

export default function EndStayReportCta({ bookingId, locale, status, endDate }: Props) {
  if (!shouldShow(status, endDate)) return null;
  const isFr = locale !== 'en';

  return (
    <div className="bg-gradient-to-r from-gold-50 to-ivory-50 border border-gold-300/60 rounded-xl p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <FileText className="h-5 w-5 text-gold-600 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-charcoal">
            {isFr ? 'Rapport de fin de séjour' : 'End-of-stay report'}
          </p>
          <p className="text-xs text-charcoal/70">
            {isFr
              ? "Générer et envoyer un rapport structuré au client."
              : 'Generate and send a structured report to the client.'}
          </p>
        </div>
      </div>
      <Link
        href={`/${locale}/admin/reservations/${bookingId}/end-report`}
        className="inline-flex items-center gap-1 rounded-lg bg-gold-500 hover:bg-gold-600 px-3 py-1.5 text-sm font-medium text-white whitespace-nowrap flex-shrink-0"
      >
        {isFr ? 'Générer' : 'Generate'}
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
