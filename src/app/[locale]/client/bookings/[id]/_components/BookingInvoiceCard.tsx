import { FileText } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import { toNumber } from '@/lib/decimal';
import type { BookingDetailTranslations } from '../_lib/i18n';
import type { Prisma } from '@prisma/client';

type InvoiceData = {
  id: string;
  invoiceNumber: string;
  amount: Prisma.Decimal | number;
  status: string;
};

interface BookingInvoiceCardProps {
  invoice: InvoiceData;
  locale: string;
  t: BookingDetailTranslations;
}

export default function BookingInvoiceCard({ invoice, locale, t }: BookingInvoiceCardProps) {
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="h-4 w-4 text-gold-500" />
        <h3 className="font-semibold text-charcoal text-sm">{t.invoice}</h3>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-sm font-semibold text-charcoal">{invoice.invoiceNumber}</p>
          <p className="text-lg font-bold text-gold-600">{formatMAD(toNumber(invoice.amount))}</p>
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            invoice.status === 'PAID'
              ? 'bg-green-100 text-green-700'
              : invoice.status === 'PARTIALLY_PAID'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-amber-100 text-amber-700'
          }`}>
            {invoice.status === 'PAID'
              ? (locale === 'fr' ? 'Payée' : locale === 'ar' ? 'مدفوعة' : 'Paid')
              : invoice.status === 'PARTIALLY_PAID'
              ? (locale === 'fr' ? 'Partiellement payée' : locale === 'ar' ? 'مدفوعة جزئيًا' : 'Partially paid')
              : (locale === 'fr' ? 'En attente' : locale === 'ar' ? 'معلقة' : 'Pending')}
          </span>
        </div>
        <a
          href={`/api/invoices/${invoice.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-2 bg-gold-50 text-gold-700 rounded-lg text-sm font-medium hover:bg-gold-100 transition-colors border border-gold-200"
        >
          <FileText className="h-4 w-4" />
          PDF
        </a>
      </div>
    </div>
  );
}
