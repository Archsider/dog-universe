import { FileText } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import { toNumber } from '@/lib/decimal';
import type { BookingDetailTranslations } from '../_lib/i18n';
import type { Prisma } from '@prisma/client';

type SupplementaryInvoiceData = {
  invoiceNumber: string;
  amount: Prisma.Decimal | number;
  paidAmount: Prisma.Decimal | number;
  status: string;
};

interface BookingSupplementaryInvoiceCardProps {
  bookingId: string;
  supplementaryInvoice: SupplementaryInvoiceData;
  locale: string;
  t: BookingDetailTranslations;
}

export default function BookingSupplementaryInvoiceCard({
  bookingId,
  supplementaryInvoice,
  locale,
  t,
}: BookingSupplementaryInvoiceCardProps) {
  const amount = toNumber(supplementaryInvoice.amount);
  const paidAmount = toNumber(supplementaryInvoice.paidAmount);

  return (
    <div className="bg-white rounded-xl border border-amber-200 p-5 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="h-4 w-4 text-amber-500" />
        <h3 className="font-semibold text-charcoal text-sm">{t.supplementaryInvoice}</h3>
        <span className="ml-auto text-xs px-2 py-0.5 rounded font-medium bg-amber-100 text-amber-700">
          {locale === 'fr'
            ? `Réservation #${bookingId.slice(0, 8).toUpperCase()}`
            : locale === 'ar'
            ? `حجز #${bookingId.slice(0, 8).toUpperCase()}`
            : `Booking #${bookingId.slice(0, 8).toUpperCase()}`}
        </span>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">{t.invoiceNumber}</span>
          <span className="font-mono font-semibold text-charcoal">{supplementaryInvoice.invoiceNumber}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">{t.amount}</span>
          <span className="font-bold text-amber-600">{formatMAD(amount)}</span>
        </div>
        {paidAmount > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">{t.paid}</span>
            <span className="text-green-600">{formatMAD(paidAmount)}</span>
          </div>
        )}
        <div className="flex justify-between pt-2 border-t border-ivory-100">
          <span className="text-gray-500">{t.remaining}</span>
          <span className="font-semibold text-charcoal">{formatMAD(amount - paidAmount)}</span>
        </div>
        <div className="flex justify-between items-center pt-1">
          <span className="text-gray-500">Statut</span>
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            supplementaryInvoice.status === 'PAID'
              ? 'bg-green-100 text-green-700'
              : supplementaryInvoice.status === 'PARTIALLY_PAID'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-amber-100 text-amber-700'
          }`}>
            {supplementaryInvoice.status === 'PAID'
              ? t.statusPaid
              : supplementaryInvoice.status === 'PARTIALLY_PAID'
              ? t.statusPartial
              : t.statusPending}
          </span>
        </div>
      </div>
    </div>
  );
}
