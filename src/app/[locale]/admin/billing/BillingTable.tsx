'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, Download, CheckCheck, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, formatMAD, getInvoiceStatusColor } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import CreateInvoiceButton from './CreateInvoiceButton';

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: string;
  issuedAt: string | Date;
  client: { id: string; name: string; email: string };
  booking: { serviceType: string } | null;
}

interface Props {
  invoices: Invoice[];
  locale: string;
  statusLbls: Record<string, string>;
  noInvoices: string;
}

const BULK_ACTIONS = [
  { status: 'PAID',      labelFr: 'Marquer payée(s)',   labelEn: 'Mark as Paid',      className: 'bg-green-600 hover:bg-green-700 text-white border-0' },
  { status: 'PENDING',   labelFr: 'Remettre en attente', labelEn: 'Set Pending',        className: 'bg-amber-500 hover:bg-amber-600 text-white border-0' },
  { status: 'CANCELLED', labelFr: 'Annuler',             labelEn: 'Cancel',             className: 'text-red-500 border-red-200 hover:bg-red-50' },
];

export default function BillingTable({ invoices, locale, statusLbls, noInvoices }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<string | null>(null);
  const router = useRouter();
  const isFr = locale !== 'en';

  const toggleAll = () => {
    setSelected(prev => prev.size === invoices.length ? new Set() : new Set(invoices.map(i => i.id)));
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const applyBulk = async (status: string) => {
    if (selected.size === 0) return;
    setApplying(status);
    try {
      const res = await fetch('/api/admin/invoices/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), status }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      toast({ title: isFr ? `${data.updated} facture(s) mise(s) à jour` : `${data.updated} invoice(s) updated`, variant: 'success' });
      setSelected(new Set());
      router.refresh();
    } catch {
      toast({ title: isFr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setApplying(null);
    }
  };

  if (invoices.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card">
        <div className="text-center py-12 text-gray-400">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>{noInvoices}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-3 bg-charcoal/5 border border-charcoal/10 rounded-xl">
          <span className="text-sm font-medium text-charcoal">
            {selected.size} {isFr ? 'sélectionnée(s)' : 'selected'}
          </span>
          <div className="flex gap-2 ml-auto flex-wrap">
            {BULK_ACTIONS.map(a => (
              <Button
                key={a.status}
                size="sm"
                variant="outline"
                className={a.className}
                disabled={!!applying}
                onClick={() => applyBulk(a.status)}
              >
                {applying === a.status
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  : <CheckCheck className="h-3.5 w-3.5 mr-1" />}
                {isFr ? a.labelFr : a.labelEn}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ivory-200 bg-ivory-50">
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === invoices.length && invoices.length > 0}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-gold-500 focus:ring-gold-400 cursor-pointer"
                  />
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{isFr ? 'Référence' : 'Reference'}</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">{isFr ? 'Client' : 'Client'}</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden sm:table-cell">{isFr ? 'Date' : 'Date'}</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">Total</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">Statut</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const isChecked = selected.has(inv.id);
                return (
                  <tr
                    key={inv.id}
                    className={`border-b border-ivory-100 last:border-0 transition-colors ${isChecked ? 'bg-gold-50/50' : 'hover:bg-ivory-50'}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(inv.id)}
                        className="rounded border-gray-300 text-gold-500 focus:ring-gold-400 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-semibold text-charcoal">{inv.invoiceNumber}</span>
                      {inv.booking && (
                        <p className="text-xs text-gray-400">
                          {inv.booking.serviceType === 'BOARDING' ? (isFr ? 'Pension' : 'Boarding') : 'Taxi'}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Link href={`/${locale}/admin/clients/${inv.client.id}`} className="text-sm text-charcoal hover:text-gold-600">
                        {inv.client.name || inv.client.email}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">{formatDate(new Date(inv.issuedAt), locale)}</td>
                    <td className="px-4 py-3 text-right font-bold text-charcoal">{formatMAD(inv.amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={`text-xs ${getInvoiceStatusColor(inv.status)}`}>{statusLbls[inv.status] || inv.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-400 hover:text-gold-600 rounded">
                          <Download className="h-4 w-4" />
                        </a>
                        <CreateInvoiceButton invoiceId={inv.id} currentStatus={inv.status} locale={locale} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
