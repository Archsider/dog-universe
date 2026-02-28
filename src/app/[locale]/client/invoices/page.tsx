import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { FileText, Download, Calendar, CheckCircle2, Clock, Package, Car } from 'lucide-react';
import { formatDate, formatMAD } from '@/lib/utils';

interface PageProps { params: { locale: string } }

export default async function InvoicesPage({ params: { locale } }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);

  const invoices = await prisma.invoice.findMany({
    where: { clientId: session.user.id },
    include: {
      items: true,
      booking: {
        select: {
          serviceType: true,
          startDate: true,
          endDate: true,
          bookingPets: { include: { pet: { select: { name: true } } } },
        },
      },
    },
    orderBy: { issuedAt: 'desc' },
  });

  const l = {
    fr: {
      title: 'Mes factures',
      noInvoices: 'Aucune facture pour l\'instant.',
      download: 'Télécharger PDF',
      issued: 'Émise le',
      paid: 'Payée le',
      pending: 'En attente de paiement',
      boarding: 'Pension',
      taxi: 'Taxi animalier',
      total: 'Total',
      statusPaid: 'Payée',
      statusPending: 'En attente',
      statusCancelled: 'Annulée',
    },
    en: {
      title: 'My invoices',
      noInvoices: 'No invoices yet.',
      download: 'Download PDF',
      issued: 'Issued on',
      paid: 'Paid on',
      pending: 'Payment pending',
      boarding: 'Boarding',
      taxi: 'Pet Taxi',
      total: 'Total',
      statusPaid: 'Paid',
      statusPending: 'Pending',
      statusCancelled: 'Cancelled',
    },
  };
  const t = l[locale as keyof typeof l] || l.fr;

  const statusLabel = (s: string) =>
    s === 'PAID' ? t.statusPaid : s === 'CANCELLED' ? t.statusCancelled : t.statusPending;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-serif font-bold text-charcoal mb-6">{t.title}</h1>

      {invoices.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-[#F0D98A]/40">
          <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">{t.noInvoices}</p>
          <Link href={`/${locale}/client/history`} className="text-sm text-gold-600 mt-2 inline-block">
            ← {locale === 'fr' ? 'Voir mes réservations' : 'View my bookings'}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {invoices.map((invoice) => {
            const isPaid = invoice.status === 'PAID';
            const isCancelled = invoice.status === 'CANCELLED';
            const booking = invoice.booking;
            const pets = booking?.bookingPets.map(bp => bp.pet.name).join(', ');
            const isBoarding = booking?.serviceType === 'BOARDING';

            return (
              <div
                key={invoice.id}
                className={`bg-white rounded-xl border p-5 shadow-card ${
                  isCancelled ? 'border-gray-200 opacity-60' : 'border-[#F0D98A]/40'
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl flex-shrink-0 ${isPaid ? 'bg-green-50' : isCancelled ? 'bg-gray-50' : 'bg-amber-50'}`}>
                      <FileText className={`h-5 w-5 ${isPaid ? 'text-green-500' : isCancelled ? 'text-gray-400' : 'text-amber-500'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-charcoal text-sm">{invoice.invoiceNumber}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                          isPaid
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : isCancelled
                            ? 'bg-gray-100 text-gray-500 border-gray-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {isPaid ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {statusLabel(invoice.status)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                        <Calendar className="h-3 w-3" />
                        {t.issued} {formatDate(invoice.issuedAt, locale)}
                        {isPaid && invoice.paidAt && (
                          <span className="ml-2 text-green-600">· {t.paid} {formatDate(invoice.paidAt, locale)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-2xl font-bold text-charcoal">{formatMAD(invoice.amount)}</div>
                    <a
                      href={`/api/invoices/${invoice.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-1 text-xs text-gold-600 hover:text-gold-700 border border-gold-300 rounded-lg px-2.5 py-1 hover:bg-gold-50 transition-colors"
                    >
                      <Download className="h-3 w-3" />{t.download}
                    </a>
                  </div>
                </div>

                {/* Booking context */}
                {booking && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-ivory-50 rounded-lg mb-4 text-sm text-gray-600">
                    {isBoarding
                      ? <Package className="h-3.5 w-3.5 text-gold-500 flex-shrink-0" />
                      : <Car className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                    }
                    <span className="font-medium">{isBoarding ? t.boarding : t.taxi}</span>
                    {pets && <span className="text-gray-400">·</span>}
                    {pets && <span>{pets}</span>}
                    {booking.startDate && (
                      <>
                        <span className="text-gray-400">·</span>
                        <span>{formatDate(booking.startDate, locale)}{booking.endDate && ` → ${formatDate(booking.endDate, locale)}`}</span>
                      </>
                    )}
                  </div>
                )}

                {/* Line items */}
                {invoice.items.length > 0 && (
                  <div className="border-t border-ivory-100 pt-3">
                    <div className="space-y-2">
                      {invoice.items.map(item => (
                        <div key={item.id} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 flex-1">
                            {item.description}
                            {item.quantity > 1 && <span className="text-gray-400 ml-1">× {item.quantity}</span>}
                          </span>
                          <span className="font-medium text-charcoal ml-4">{formatMAD(item.total)}</span>
                        </div>
                      ))}
                    </div>
                    {invoice.items.length > 1 && (
                      <div className="flex justify-between items-center pt-2 mt-2 border-t border-ivory-100">
                        <span className="text-sm font-semibold text-charcoal">{t.total}</span>
                        <span className="font-bold text-charcoal">{formatMAD(invoice.amount)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes */}
                {invoice.notes && (
                  <p className="text-xs text-gray-400 italic mt-3 pt-3 border-t border-ivory-100">{invoice.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
