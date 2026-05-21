import Link from 'next/link';
import { FileText, Download, Eye, Pencil } from 'lucide-react';
import { formatDate, formatMAD } from '@/lib/utils';
import PaymentModal from './PaymentModalLazy';
import ResendInvoiceButton from '@/components/admin/ResendInvoiceButton';

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  clientDisplayName: string | null;
  serviceType: string | null;
  issuedAt: Date;
  amount: unknown;
  paidAmount: unknown;
  status: string;
  client: { id: string; name: string; email: string; isWalkIn: boolean };
  booking: { serviceType: string } | null;
}

interface SortCol {
  key: string;
  label: string;
  align: 'left' | 'right';
}

interface BillingInvoicesTableProps {
  locale: string;
  invoices: InvoiceRow[];
  invoiceCount: number;
  sort: string;
  order: 'asc' | 'desc';
  status: string;
  page: number;
  totalPages: number;
  highlightInvoiceId: string;
  buildQS: (overrides: Record<string, string | null | undefined>) => string;
}

const STATUS_LABELS_FR: Record<string, string> = {
  PENDING: 'En attente', PARTIALLY_PAID: 'Partiel', PAID: 'Payée', CANCELLED: 'Annulée',
};
const STATUS_LABELS_EN: Record<string, string> = {
  PENDING: 'Pending', PARTIALLY_PAID: 'Partial', PAID: 'Paid', CANCELLED: 'Cancelled',
};
const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  PAID:           { bg: '#EAF7EF', color: '#1A7A45', border: 'rgba(26,122,69,0.2)' },
  PARTIALLY_PAID: { bg: '#FEF3E2', color: '#B45309', border: 'rgba(180,83,9,0.2)' },
  PENDING:        { bg: '#F0EFFE', color: '#5B4FCF', border: 'rgba(91,79,207,0.2)' },
  CANCELLED:      { bg: '#F5F5F5', color: '#6B6B6B', border: 'rgba(0,0,0,0.08)' },
};

export function BillingInvoicesTable({
  locale,
  invoices,
  invoiceCount,
  sort,
  order,
  status,
  page,
  totalPages,
  highlightInvoiceId,
  buildQS,
}: BillingInvoicesTableProps) {
  const isFr = locale === 'fr';
  const statusLbls = isFr ? STATUS_LABELS_FR : STATUS_LABELS_EN;

  const SORT_COLS: SortCol[] = [
    { key: 'reference', label: isFr ? 'Référence'  : 'Reference', align: 'left'  },
    { key: 'client',    label: isFr ? 'Client'     : 'Client',    align: 'left'  },
    { key: 'date',      label: isFr ? 'Date'       : 'Date',      align: 'left'  },
    { key: 'total',     label: isFr ? 'Total'      : 'Total',     align: 'right' },
    { key: 'paid',      label: isFr ? 'Payé'       : 'Paid',      align: 'right' },
    { key: 'remaining', label: isFr ? 'Restant'    : 'Remaining', align: 'right' },
  ];

  return (
    <div className="bg-white rounded-xl border border-[rgba(196,151,74,0.2)] overflow-hidden">
      {invoices.length === 0 ? (
        <div className="text-center py-16 text-[#8A7E75]">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-25" />
          <p className="text-sm font-medium">
            {isFr ? 'Aucune facture ce mois-ci' : 'No invoices this month'}
          </p>
          <p className="text-xs mt-1 opacity-60">
            {isFr ? 'Modifiez les filtres ou naviguez vers un autre mois.' : 'Adjust filters or navigate to another month.'}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile : carte par facture (le tableau 780px forçait un scroll
              horizontal qui cachait les boutons d'action — bug audit
              2026-05-21). Desktop ≥ sm : tableau classique. */}
          <ul className="sm:hidden divide-y divide-[rgba(196,151,74,0.1)]">
            {invoices.map(inv => {
              const invAmount = Number(inv.amount);
              const invPaidAmount = Number(inv.paidAmount);
              const remaining = Math.max(0, invAmount - invPaidAmount);
              const serviceLabel =
                inv.serviceType === 'PRODUCT_SALE'
                  ? (isFr ? 'Croquettes / Produits' : 'Croquettes / Products')
                  : inv.booking?.serviceType === 'BOARDING'
                    ? (isFr ? 'Pension' : 'Boarding')
                    : inv.booking?.serviceType === 'PET_TAXI'
                      ? (isFr ? 'Taxi animalier' : 'Pet Taxi')
                      : inv.booking?.serviceType ?? '';
              const statusStyle = STATUS_STYLE[inv.status] ?? STATUS_STYLE['CANCELLED'];
              return (
                <li
                  key={inv.id}
                  id={`invoice-card-${inv.id}`}
                  className={`p-4 ${highlightInvoiceId === inv.id ? 'invoice-row-highlight' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <span className="font-mono text-sm font-bold text-[#9A7235]">{inv.invoiceNumber}</span>
                      {serviceLabel && <p className="text-xs text-[#8A7E75] mt-0.5">{serviceLabel}</p>}
                      <Link href={`/${locale}/admin/clients/${inv.client.id}`} className="block text-sm text-[#2A2520] font-medium mt-1 truncate">
                        {inv.clientDisplayName ?? inv.client.name}
                      </Link>
                      <p className="text-[11px] text-[#8A7E75] mt-0.5">{formatDate(inv.issuedAt, locale)}</p>
                    </div>
                    <span
                      className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold border whitespace-nowrap"
                      style={{ backgroundColor: statusStyle.bg, color: statusStyle.color, borderColor: statusStyle.border }}
                    >
                      {statusLbls[inv.status] || inv.status}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 text-sm mb-3">
                    <span className="font-bold text-[#2A2520]">{formatMAD(inv.amount as number)}</span>
                    {remaining > 0
                      ? <span className="text-xs font-semibold text-[#B45309]">{isFr ? 'Reste' : 'Due'} {formatMAD(remaining)}</span>
                      : invPaidAmount > 0
                        ? <span className="text-xs font-semibold text-[#1A7A45]">{isFr ? 'Payée' : 'Paid'}</span>
                        : null}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Link href={`/${locale}/admin/invoices/${inv.id}`} title={isFr ? 'Fiche facture' : 'Invoice details'} className="p-2 text-[#8A7E75] hover:text-[#C4974A] rounded border border-[rgba(196,151,74,0.2)]">
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <a href={`/api/invoices/${inv.id}/pdf?view=1`} target="_blank" rel="noopener noreferrer" title={isFr ? 'Aperçu' : 'Preview'} className="p-2 text-[#8A7E75] hover:text-[#C4974A] rounded border border-[rgba(196,151,74,0.2)]">
                      <Eye className="h-4 w-4" />
                    </a>
                    <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noopener noreferrer" title={isFr ? 'Télécharger' : 'Download'} className="p-2 text-[#8A7E75] hover:text-[#C4974A] rounded border border-[rgba(196,151,74,0.2)]">
                      <Download className="h-4 w-4" />
                    </a>
                    <ResendInvoiceButton invoiceId={inv.id} locale={locale} />
                    <PaymentModal
                      invoiceId={inv.id}
                      currentStatus={inv.status}
                      locale={locale}
                      invoiceAmount={invAmount}
                      paidAmount={invPaidAmount}
                      isWalkIn={inv.client.isWalkIn}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="overflow-x-auto hidden sm:block">
            <table className="w-full min-w-[780px]">
              <thead>
                <tr className="border-b border-[rgba(196,151,74,0.1)]">
                  {SORT_COLS.map(col => {
                    const isActive = sort === col.key;
                    const nextOrder = isActive && order === 'desc' ? 'asc' : 'desc';
                    const arrow = isActive ? (order === 'asc' ? '↑' : '↓') : '↕';
                    return (
                      <th
                        key={col.key}
                        className={`text-${col.align} text-[11px] font-semibold text-[#8A7E75] px-5 py-3.5 uppercase tracking-wider bg-[#FEFCF9]`}
                      >
                        <Link
                          href={buildQS({ sort: col.key, order: nextOrder, page: null })}
                          className={`inline-flex items-center gap-1 hover:text-[#C4974A] transition-colors ${isActive ? 'text-[#C4974A]' : ''}`}
                        >
                          {col.label}
                          <span className="text-[10px] opacity-50">{arrow}</span>
                        </Link>
                      </th>
                    );
                  })}
                  <th className="text-left text-[11px] font-semibold text-[#8A7E75] px-5 py-3.5 uppercase tracking-wider bg-[#FEFCF9]">
                    {isFr ? 'Statut' : 'Status'}
                  </th>
                  <th className="px-5 py-3.5 bg-[#FEFCF9]" />
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => {
                  const invAmount = Number(inv.amount);
                  const invPaidAmount = Number(inv.paidAmount);
                  const remaining = Math.max(0, invAmount - invPaidAmount);
                  const serviceLabel =
                    inv.serviceType === 'PRODUCT_SALE'
                      ? (isFr ? 'Croquettes / Produits' : 'Croquettes / Products')
                      : inv.booking?.serviceType === 'BOARDING'
                        ? (isFr ? 'Pension' : 'Boarding')
                        : inv.booking?.serviceType === 'PET_TAXI'
                          ? (isFr ? 'Taxi animalier' : 'Pet Taxi')
                          : inv.booking?.serviceType ?? '';
                  const statusStyle = STATUS_STYLE[inv.status] ?? STATUS_STYLE['CANCELLED'];
                  const remainingColor =
                    inv.status === 'PARTIALLY_PAID' ? '#B45309'
                    : inv.status === 'PENDING' ? '#5B4FCF'
                    : '#8A7E75';
                  return (
                    <tr
                      key={inv.id}
                      id={`invoice-row-${inv.id}`}
                      className={`border-b border-[rgba(196,151,74,0.07)] last:border-0 hover:bg-[#FEFCF9] transition-colors ${
                        highlightInvoiceId === inv.id ? 'invoice-row-highlight' : ''
                      }`}
                    >
                      <td className="px-5 py-4">
                        <span className="font-mono text-sm font-bold text-[#9A7235]">{inv.invoiceNumber}</span>
                        {serviceLabel && (
                          <p className="text-xs text-[#8A7E75] mt-0.5">{serviceLabel}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <Link href={`/${locale}/admin/clients/${inv.client.id}`} className="text-sm text-[#2A2520] hover:text-[#C4974A] transition-colors font-medium">
                          {inv.clientDisplayName ?? inv.client.name}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-sm text-[#8A7E75]">{formatDate(inv.issuedAt, locale)}</td>
                      <td className="px-5 py-4 text-right text-[15px] font-bold text-[#2A2520]">{formatMAD(inv.amount as number)}</td>
                      <td className="px-5 py-4 text-right text-sm">
                        {invPaidAmount > 0 ? (
                          <span className="text-[#1A7A45] font-semibold">{formatMAD(invPaidAmount)}</span>
                        ) : (
                          <span className="text-[#8A7E75]/30">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right text-sm">
                        {remaining > 0 ? (
                          <span className="font-semibold" style={{ color: remainingColor }}>{formatMAD(remaining)}</span>
                        ) : (
                          <span className="text-[#8A7E75]/30">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border"
                          style={{ backgroundColor: statusStyle.bg, color: statusStyle.color, borderColor: statusStyle.border }}
                        >
                          {statusLbls[inv.status] || inv.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/${locale}/admin/invoices/${inv.id}`}
                            title={isFr ? 'Fiche facture' : 'Invoice details'}
                            className="p-1.5 text-[#8A7E75] hover:text-[#C4974A] rounded transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                          <a
                            href={`/api/invoices/${inv.id}/pdf?view=1`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={isFr ? 'Aperçu' : 'Preview'}
                            className="p-1.5 text-[#8A7E75] hover:text-[#C4974A] rounded transition-colors"
                          >
                            <Eye className="h-4 w-4" />
                          </a>
                          <a
                            href={`/api/invoices/${inv.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={isFr ? 'Télécharger' : 'Download'}
                            className="p-1.5 text-[#8A7E75] hover:text-[#C4974A] rounded transition-colors"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                          <ResendInvoiceButton invoiceId={inv.id} locale={locale} />
                          <PaymentModal
                            invoiceId={inv.id}
                            currentStatus={inv.status}
                            locale={locale}
                            invoiceAmount={invAmount}
                            paidAmount={invPaidAmount}
                            isWalkIn={inv.client.isWalkIn}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer: count + pagination */}
          <div className="px-5 py-3.5 border-t border-[rgba(196,151,74,0.1)] flex items-center justify-between text-xs text-[#8A7E75]">
            <span>
              {invoiceCount} {isFr ? 'facture(s)' : 'invoice(s)'}
              {status ? ` · ${(isFr ? STATUS_LABELS_FR : STATUS_LABELS_EN)[status] ?? status}` : ''}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                {page > 1 && (
                  <Link
                    href={buildQS({ page: String(page - 1) })}
                    className="px-2.5 py-1 rounded border border-[rgba(196,151,74,0.3)] hover:border-[#C4974A] hover:text-[#C4974A] transition-colors"
                  >
                    ←
                  </Link>
                )}
                <span className="px-2">
                  {page} / {totalPages}
                </span>
                {page < totalPages && (
                  <Link
                    href={buildQS({ page: String(page + 1) })}
                    className="px-2.5 py-1 rounded border border-[rgba(196,151,74,0.3)] hover:border-[#C4974A] hover:text-[#C4974A] transition-colors"
                  >
                    →
                  </Link>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
