import Link from 'next/link';
import { formatMAD } from '@/lib/utils';
import { toNumber, type DecimalLike } from '@/lib/decimal';
import CreateInvoiceFromBookingButton from './CreateInvoiceFromBookingButton';
import PaymentModal from '@/app/[locale]/admin/billing/PaymentModalLazy';
import { InvoiceCancelButton } from '@/components/admin/InvoiceCancelButton';
import { getSupplementLabel, type ItemCategory } from '@/lib/billing/cancel-invoice';

interface InvoiceData {
  id: string;
  invoiceNumber: string;
  status: string;
  amount: DecimalLike;
  paidAmount: DecimalLike;
  version?: number;
  /** Item categories — used to compute the dynamic supplement label
   *  ("Facture produits supplémentaires" vs "Supplément prolongation"
   *  vs generic). Falls back to the static label when absent. */
  itemCategories?: ItemCategory[];
}

interface BookingInvoiceSectionProps {
  invoice: InvoiceData | null;
  supplementaryInvoice: InvoiceData | null;
  bookingId: string;
  clientId: string;
  locale: string;
  label: string;
  noInvoiceLabel: string;
  isOpenEnded?: boolean;
  liveTotal?: number;
  /** Walk-in flag of the booking's client. Propagated to PaymentModal
   *  so the "Send confirmation SMS" toggle defaults correctly (off for
   *  walk-ins per ADR-0008). */
  isWalkInClient?: boolean;
}

export default function BookingInvoiceSection({
  invoice,
  supplementaryInvoice,
  bookingId,
  clientId,
  locale,
  label,
  noInvoiceLabel,
  isOpenEnded,
  liveTotal,
  isWalkInClient,
}: BookingInvoiceSectionProps) {
  const fr = locale !== 'en';
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
      <h3 className="font-semibold text-charcoal mb-3 text-sm flex items-center gap-2">
        {label}
        {isOpenEnded && invoice && (
          <span className="text-xs font-normal bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
            {fr ? 'Provisoire' : 'Provisional'}
          </span>
        )}
      </h3>

      {invoice ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-sm font-semibold text-charcoal">{invoice.invoiceNumber}</p>
            <a
              href={`/api/invoices/${invoice.id}/pdf`}
              className="text-xs text-gold-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              PDF
            </a>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Total</span>
              <span className="font-bold text-charcoal">
                {isOpenEnded && liveTotal != null
                  ? formatMAD(liveTotal)
                  : formatMAD(invoice.amount)}
                {isOpenEnded && (
                  <span className="ml-1 text-xs font-normal text-amber-600">({fr ? 'provisoire' : 'provisional'})</span>
                )}
              </span>
            </div>
            {toNumber(invoice.paidAmount) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">{locale === 'fr' ? 'Payé' : 'Paid'}</span>
                <span className="font-medium text-green-700">{formatMAD(invoice.paidAmount)}</span>
              </div>
            )}
            {invoice.status !== 'PAID' && (
              <div className="flex justify-between border-t border-ivory-100 pt-1">
                <span className="text-gray-600 font-medium">{locale === 'fr' ? 'Restant' : 'Remaining'}</span>
                <span className="font-bold text-orange-600">
                  {formatMAD(Math.max(0, toNumber(invoice.amount) - toNumber(invoice.paidAmount)))}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PaymentModal
              invoiceId={invoice.id}
              currentStatus={invoice.status}
              locale={locale}
              invoiceAmount={toNumber(invoice.amount)}
              paidAmount={toNumber(invoice.paidAmount)}
              isWalkIn={isWalkInClient}
              triggerVariant="full"
            />
            <Link href={`/${locale}/admin/billing?invoiceId=${invoice.id}`} className="text-xs text-gray-400 hover:text-gold-600">
              {locale === 'fr' ? 'Voir facturation' : 'View billing'}
            </Link>
            <div className="ml-auto">
              <InvoiceCancelButton
                invoiceId={invoice.id}
                invoiceNumber={invoice.invoiceNumber}
                amount={toNumber(invoice.amount)}
                paidAmount={toNumber(invoice.paidAmount)}
                status={invoice.status}
                locale={locale}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">{noInvoiceLabel}</p>
          <CreateInvoiceFromBookingButton bookingId={bookingId} clientId={clientId} locale={locale} />
        </div>
      )}

      {supplementaryInvoice && (
        <div className="mt-4 pt-4 border-t border-[#F0D98A]/40 space-y-2">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
            {(() => {
              // Dynamic label : products-only supplements should not be
              // labeled "Supplément prolongation". Falls back to the
              // static label when itemCategories isn't provided. Source :
              // audit Mehdi 2026-05-17.
              const cats = supplementaryInvoice.itemCategories;
              if (cats && cats.length > 0) {
                return getSupplementLabel(
                  cats.map((c) => ({ category: c })),
                  locale === 'en' ? 'en' : locale === 'ar' ? 'ar' : 'fr',
                );
              }
              return locale === 'fr' ? 'Supplément prolongation' : 'Extension surcharge';
            })()}
          </p>
          <div className="flex items-center justify-between">
            <p className="font-mono text-sm font-semibold text-charcoal">{supplementaryInvoice.invoiceNumber}</p>
            <a
              href={`/api/invoices/${supplementaryInvoice.id}/pdf`}
              className="text-xs text-gold-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              PDF
            </a>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Total</span>
              <span className="font-bold text-charcoal">{formatMAD(supplementaryInvoice.amount)}</span>
            </div>
            {toNumber(supplementaryInvoice.paidAmount) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">{locale === 'fr' ? 'Payé' : 'Paid'}</span>
                <span className="font-medium text-green-700">{formatMAD(supplementaryInvoice.paidAmount)}</span>
              </div>
            )}
            {supplementaryInvoice.status !== 'PAID' && (
              <div className="flex justify-between border-t border-ivory-100 pt-1">
                <span className="text-gray-600 font-medium">{locale === 'fr' ? 'Restant' : 'Remaining'}</span>
                <span className="font-bold text-orange-600">
                  {formatMAD(Math.max(0, toNumber(supplementaryInvoice.amount) - toNumber(supplementaryInvoice.paidAmount)))}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Statut</span>
              <span
                className={`text-xs font-semibold ${
                  supplementaryInvoice.status === 'PAID'
                    ? 'text-green-700'
                    : supplementaryInvoice.status === 'PARTIALLY_PAID'
                    ? 'text-blue-600'
                    : 'text-orange-600'
                }`}
              >
                {supplementaryInvoice.status === 'PAID'
                  ? locale === 'fr'
                    ? 'Payée'
                    : 'Paid'
                  : supplementaryInvoice.status === 'PARTIALLY_PAID'
                  ? locale === 'fr'
                    ? 'Part. payée'
                    : 'Part. paid'
                  : locale === 'fr'
                  ? 'En attente'
                  : 'Pending'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PaymentModal
              invoiceId={supplementaryInvoice.id}
              currentStatus={supplementaryInvoice.status}
              locale={locale}
              invoiceAmount={toNumber(supplementaryInvoice.amount)}
              paidAmount={toNumber(supplementaryInvoice.paidAmount)}
              isWalkIn={isWalkInClient}
              triggerVariant="full"
            />
            <div className="ml-auto">
              <InvoiceCancelButton
                invoiceId={supplementaryInvoice.id}
                invoiceNumber={supplementaryInvoice.invoiceNumber}
                amount={toNumber(supplementaryInvoice.amount)}
                paidAmount={toNumber(supplementaryInvoice.paidAmount)}
                status={supplementaryInvoice.status}
                locale={locale}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
