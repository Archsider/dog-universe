import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, Calendar } from 'lucide-react';
import { formatDate, formatMAD, getInvoiceStatusColor } from '@/lib/utils';

interface PageProps { params: { locale: string } }

export default async function InvoicesPage({ params: { locale } }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);

  const invoices = await prisma.invoice.findMany({
    where: { clientId: session.user.id },
    include: { items: true },
    orderBy: { issuedAt: 'desc' },
  });

  const labels = {
    fr: {
      title: 'Mes factures',
      noInvoices: 'Aucune facture pour l\'instant.',
      download: 'Télécharger PDF',
      date: 'Date',
    },
    en: {
      title: 'My invoices',
      noInvoices: 'No invoices yet.',
      download: 'Download PDF',
      date: 'Date',
    },
  };

  const isl: Record<string, Record<string, string>> = {
    fr: { PENDING: 'En attente', PAID: 'Payée', CANCELLED: 'Annulée' },
    en: { PENDING: 'Pending', PAID: 'Paid', CANCELLED: 'Cancelled' },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;
  const sl = isl[locale] || isl.fr;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-serif font-bold text-charcoal mb-6">{l.title}</h1>

      {invoices.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-[#F0D98A]/40">
          <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">{l.noInvoices}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {invoices.map((invoice) => (
            <div key={invoice.id} className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <FileText className="h-5 w-5 text-gold-500 flex-shrink-0" />
                    <span className="font-mono font-semibold text-charcoal">{invoice.invoiceNumber}</span>
                    <Badge className={`text-xs ${getInvoiceStatusColor(invoice.status)}`}>{sl[invoice.status] || invoice.status}</Badge>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-gray-500 mb-3">
                    <Calendar className="h-3 w-3" />
                    <span>{l.date} : {formatDate(invoice.issuedAt, locale)}</span>
                  </div>
                  {invoice.items.length > 0 && (
                    <div className="space-y-1">
                      {invoice.items.map(item => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span className="text-gray-600">{item.description}</span>
                          <span className="font-medium text-charcoal">{formatMAD(item.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-2xl font-bold text-charcoal">{formatMAD(invoice.amount)}</div>
                  <a
                    href={`/api/invoices/${invoice.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-gold-600 hover:text-gold-700 border border-gold-300 rounded px-2 py-1 hover:bg-gold-50 transition-colors"
                  >
                    <Download className="h-3 w-3" />{l.download}
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
