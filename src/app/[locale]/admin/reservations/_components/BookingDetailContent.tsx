'use client';

import { useState, useCallback, useRef, type MutableRefObject } from 'react';
import type { BookingDetail, BookingStatus } from '@/types/booking-detail';
import BookingSection from './BookingSection';
import BookingActions from './BookingActions';
import CloseStayDialog from './CloseStayDialog';
import OverviewSection from './sections/OverviewSection';
import PetsSection from './sections/PetsSection';
import InvoiceSection from './sections/InvoiceSection';
import HistorySection from './sections/HistorySection';
import NotesSection from './sections/NotesSection';
import type { PricingSettings } from '@/lib/pricing-rules';

interface BookingDetailContentProps {
  booking: BookingDetail;
  pricing: PricingSettings;
  locale: string;
  onStatusChange?: (newStatus: BookingStatus) => void;
  /** Ref to the first editable field — set from parent for keyboard `E` shortcut. */
  firstEditRef?: MutableRefObject<(() => void) | null>;
}

export default function BookingDetailContent({
  booking: initialBooking,
  pricing,
  locale,
  onStatusChange,
  firstEditRef,
}: BookingDetailContentProps) {
  const fr = locale !== 'en';
  const [booking, setBooking] = useState(initialBooking);
  const [closeStayOpen, setCloseStayOpen] = useState(false);

  const handleStatusChange = useCallback((newStatus: BookingStatus) => {
    setBooking((prev) => ({ ...prev, status: newStatus }));
    onStatusChange?.(newStatus);
  }, [onStatusChange]);

  const handleNotesChange = useCallback((notes: string) => {
    setBooking((prev) => ({ ...prev, notes }));
  }, []);

  // Build CloseStayDialog booking shape. `invoiceAmount` is the post-discount
  // total (source of truth once the invoice exists). The dialog falls back
  // to `totalPrice` for bookings that don't have an invoice yet.
  const closeStayBooking = {
    id: booking.id,
    clientName: booking.client.name ?? booking.client.email,
    pets: booking.pets.map((p) => ({ id: p.id, name: p.name, species: p.species })),
    startDate: booking.startDate,
    endDate: booking.endDate,
    isOpenEnded: booking.isOpenEnded,
    totalPrice: booking.totalPrice,
    invoiceAmount: booking.invoice?.amount ?? null,
  };

  return (
    <>
      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto">
        <BookingSection id="overview" title={fr ? 'Aperçu' : 'Overview'}>
          <OverviewSection b={booking} locale={locale} />
        </BookingSection>

        <BookingSection
          id="pets"
          title={fr ? 'Animaux' : 'Pets'}
          badge={`${booking.pets.length}`}
        >
          <PetsSection pets={booking.pets} locale={locale} />
        </BookingSection>

        <BookingSection id="invoice" title={fr ? 'Facturation' : 'Billing'}>
          <InvoiceSection
            invoice={booking.invoice}
            supplementaryInvoice={booking.supplementaryInvoice}
            bookingId={booking.id}
            locale={locale}
            isOpenEnded={booking.isOpenEnded}
            liveTotal={booking.liveTotal}
          />
        </BookingSection>

        <BookingSection id="history" title={fr ? 'Historique' : 'History'}>
          <HistorySection
            actionLog={booking.actionLog}
            createdAt={booking.createdAt}
            locale={locale}
          />
        </BookingSection>

        <BookingSection id="notes" title="Notes">
          <NotesSection
            bookingId={booking.id}
            notes={booking.notes}
            adminNotes={booking.adminNotes}
            locale={locale}
            onNotesChange={handleNotesChange}
          />
        </BookingSection>
      </div>

      {/* Sticky footer with actions */}
      <div className="flex-shrink-0 border-t border-ivory-100 bg-white px-6 py-4">
        <BookingActions
          bookingId={booking.id}
          version={booking.version}
          status={booking.status}
          serviceType={booking.serviceType}
          locale={locale}
          invoiceId={booking.invoice?.id ?? null}
          onStatusChange={handleStatusChange}
          onCloseStay={() => setCloseStayOpen(true)}
        />
      </div>

      {/* Close stay dialog (boarding checkout) */}
      <CloseStayDialog
        open={closeStayOpen}
        onClose={() => setCloseStayOpen(false)}
        booking={closeStayBooking}
        pricing={pricing}
        locale={locale}
        onSuccess={() => handleStatusChange('COMPLETED')}
      />
    </>
  );
}
