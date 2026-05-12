'use client';

import { formatMAD } from '@/lib/utils';
import type { BookingDetailInvoice } from '@/types/booking-detail';

function InvoiceCard({
  invoice,
  label,
  locale,
  provisional,
  liveTotal,
}: {
  invoice: BookingDetailInvoice;
  label: string;
  locale: string;
  provisional?: boolean;
  liveTotal?: number | null;
}) {
  const fr = locale !== 'en';
  const remaining = Math.max(0, invoice.amount - invoice.paidAmount);
  const displayTotal = provisional && liveTotal != null ? liveTotal : invoice.amount;

  return (
    <div className="border border-ivory-200 rounded-xl overflow-hidden">
      {label && (
        <div className="bg-ivory-50 px-4 py-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</span>
          {provisional && (
            <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
              {fr ? 'Provisoire' : 'Provisional'}
            </span>
          )}
        </div>
      )}
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-semibold text-charcoal">{invoice.invoiceNumber}</span>
          <a
            href={`/api/invoices/${invoice.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-amber-600 hover:underline"
          >
            PDF ↗
          </a>
        </div>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Total</span>
            <span className="font-bold text-charcoal">{formatMAD(displayTotal)}</span>
          </div>
          {invoice.paidAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">{fr ? 'Payé' : 'Paid'}</span>
              <span className="font-medium text-green-700">{formatMAD(invoice.paidAmount)}</span>
            </div>
          )}
          {invoice.status !== 'PAID' && remaining > 0 && (
            <div className="flex justify-between border-t border-ivory-100 pt-1">
              <span className="text-gray-600 font-medium">{fr ? 'Restant' : 'Remaining'}</span>
              <span className="font-bold text-orange-600">{formatMAD(remaining)}</span>
            </div>
          )}
        </div>
        <StatusPill status={invoice.status} locale={locale} />
      </div>
    </div>
  );
}

function StatusPill({ status, locale }: { status: string; locale: string }) {
  const fr = locale !== 'en';
  const map: Record<string, { label: string; cls: string }> = {
    PAID:            { label: fr ? 'Payée' : 'Paid', cls: 'bg-green-100 text-green-800' },
    PARTIALLY_PAID:  { label: fr ? 'Part. payée' : 'Part. paid', cls: 'bg-blue-100 text-blue-800' },
    PENDING:         { label: fr ? 'En attente' : 'Pending', cls: 'bg-amber-100 text-amber-800' },
    CANCELLED:       { label: fr ? 'Annulée' : 'Cancelled', cls: 'bg-gray-100 text-gray-600' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${s.cls}`}>{s.label}</span>;
}

export default function InvoiceSection({
  invoice,
  supplementaryInvoice,
  bookingId,
  locale,
  isOpenEnded,
  liveTotal,
}: {
  invoice: BookingDetailInvoice | null;
  supplementaryInvoice: BookingDetailInvoice | null;
  bookingId: string;
  locale: string;
  isOpenEnded?: boolean;
  liveTotal?: number | null;
}) {
  const fr = locale !== 'en';

  if (!invoice) {
    if (isOpenEnded) {
      return (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold mb-0.5">
            {fr ? '⏳ Facture en attente de clôture' : '⏳ Invoice pending closure'}
          </p>
          <p className="text-xs text-amber-700">
            {fr
              ? 'La facture sera générée automatiquement lors de la clôture du séjour.'
              : 'The invoice will be generated automatically when the stay is closed.'}
          </p>
        </div>
      );
    }
    return (
      <div className="text-center py-4">
        <p className="text-sm text-gray-400 mb-3">{fr ? 'Aucune facture associée' : 'No invoice yet'}</p>
        <a
          href={`/${locale}/admin/billing?newBookingId=${bookingId}`}
          className="text-xs text-amber-600 hover:underline"
        >
          {fr ? '+ Créer une facture' : '+ Create invoice'}
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <InvoiceCard
        invoice={invoice}
        label={fr ? 'Facture principale' : 'Main invoice'}
        locale={locale}
        provisional={isOpenEnded}
        liveTotal={liveTotal}
      />
      {supplementaryInvoice && (
        <InvoiceCard
          invoice={supplementaryInvoice}
          label={fr ? 'Supplément extension' : 'Extension surcharge'}
          locale={locale}
        />
      )}
    </div>
  );
}
