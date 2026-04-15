'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Pencil, Trash2, Download, Eye, Loader2, Save, X, Plus,
  Banknote, CreditCard, Receipt, Building2,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDate, formatMAD, getInvoiceStatusColor, getInitials } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

// ── Types ───────────────────────────────────────────────────────────────────

interface InvoiceItemData {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  allocatedAmount: number;
  status: string;
}

interface PaymentData {
  id: string;
  amount: number;
  paymentMethod: string;
  paymentDate: Date | string;
}

interface BookingData {
  id: string;
  serviceType: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  bookingPets: { pet: { name: string; species: string; breed: string | null } }[];
}

export interface InvoiceData {
  id: string;
  invoiceNumber: string;
  amount: number;
  paidAmount: number;
  status: string;
  issuedAt: Date | string;
  paidAt: Date | string | null;
  notes: string | null;
  serviceType: string | null;
  supplementaryForBookingId: string | null;
  client: { id: string; name: string; email: string; phone: string | null };
  booking: BookingData | null;
  items: InvoiceItemData[];
  payments: PaymentData[];
}

interface EditItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { fr: string; en: string }> = {
  PENDING:        { fr: 'En attente',    en: 'Pending' },
  PARTIALLY_PAID: { fr: 'Partiel',       en: 'Partial' },
  PAID:           { fr: 'Payée',         en: 'Paid' },
  CANCELLED:      { fr: 'Annulée',       en: 'Cancelled' },
};

const METHOD_LABELS: Record<string, { fr: string; en: string }> = {
  CASH:     { fr: 'Espèces',  en: 'Cash' },
  CARD:     { fr: 'Carte',    en: 'Card' },
  CHECK:    { fr: 'Chèque',   en: 'Check' },
  TRANSFER: { fr: 'Virement', en: 'Transfer' },
};

const METHOD_ICONS: Record<string, React.ElementType> = {
  CASH:     Banknote,
  CARD:     CreditCard,
  CHECK:    Receipt,
  TRANSFER: Building2,
};

function toDateStr(d: Date | string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

function fmtPaymentDate(d: Date | string, locale: string): string {
  return new Date(d).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function InvoiceDetailClient({
  invoice: initialInvoice,
  locale,
}: {
  invoice: InvoiceData;
  locale: string;
}) {
  const isFr = locale === 'fr';
  const router = useRouter();

  const [invoice, setInvoice] = useState<InvoiceData>(initialInvoice);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit form state
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [editIssuedAt, setEditIssuedAt] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPaidAmount, setEditPaidAmount] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState('CASH');
  const [editClientName, setEditClientName] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');

  const enterEdit = () => {
    setEditItems(invoice.items.map(it => ({
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    })));
    setEditIssuedAt(toDateStr(invoice.issuedAt));
    setEditNotes(invoice.notes ?? '');
    setEditStatus(invoice.status);
    setEditPaidAmount(invoice.paidAmount.toFixed(2));
    const lastPayment = invoice.payments.at(-1);
    setEditPaymentMethod(lastPayment?.paymentMethod ?? 'CASH');
    setEditClientName(invoice.client.name);
    setEditClientPhone(invoice.client.phone ?? '');
    setMode('edit');
  };

  const addItem = () =>
    setEditItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0 }]);

  const removeItem = (i: number) =>
    setEditItems(prev => prev.filter((_, idx) => idx !== i));

  const updateItem = (i: number, field: keyof EditItem, value: string | number) =>
    setEditItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));

  const editTotal = editItems.reduce((s, it) => s + it.quantity * it.unitPrice, 0);

  const handleSave = async () => {
    if (editItems.length === 0) {
      toast({ title: isFr ? 'Ajoutez au moins un article' : 'Add at least one item', variant: 'destructive' });
      return;
    }
    if (editItems.some(it => !it.description.trim())) {
      toast({ title: isFr ? 'Toutes les descriptions sont obligatoires' : 'All descriptions are required', variant: 'destructive' });
      return;
    }
    if (editTotal <= 0) {
      toast({ title: isFr ? 'Le total doit être supérieur à 0' : 'Total must be greater than 0', variant: 'destructive' });
      return;
    }
    if (!editClientName.trim()) {
      toast({ title: isFr ? 'Le nom du client est obligatoire' : 'Client name is required', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const parsedPaid = parseFloat(editPaidAmount);
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: editItems.map(it => ({
            description: it.description.trim(),
            quantity: it.quantity,
            unitPrice: it.unitPrice,
          })),
          issuedAt: editIssuedAt,
          notes: editNotes,
          status: editStatus,
          paidAmount: isNaN(parsedPaid) ? 0 : Math.max(0, parsedPaid),
          paymentMethod: editPaymentMethod,
          clientName: editClientName.trim(),
          clientPhone: editClientPhone.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || (isFr ? 'Erreur serveur' : 'Server error'));
      }
      const updated = await res.json();
      setInvoice(updated);
      setMode('view');
      toast({ title: isFr ? 'Facture mise à jour' : 'Invoice updated', variant: 'success' });
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : (isFr ? 'Erreur' : 'Error'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      router.push(`/${locale}/admin/billing`);
    } catch {
      toast({ title: isFr ? 'Erreur lors de la suppression' : 'Delete failed', variant: 'destructive' });
      setDeleting(false);
    }
  };

  const remaining = Math.max(0, invoice.amount - invoice.paidAmount);

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-xl font-bold text-charcoal">{invoice.invoiceNumber}</span>
            <Badge className={`text-xs ${getInvoiceStatusColor(invoice.status)}`}>
              {STATUS_LABELS[invoice.status]?.[isFr ? 'fr' : 'en'] ?? invoice.status}
            </Badge>
          </div>
          <p className="text-sm text-gray-500 mt-1">{formatDate(invoice.issuedAt, locale)}</p>
        </div>

        {mode === 'view' ? (
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={`/api/invoices/${invoice.id}/pdf?view=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-ivory-200 rounded-lg text-gray-600 hover:border-gold-300 hover:text-gold-700 transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              {isFr ? 'Aperçu PDF' : 'PDF preview'}
            </a>
            <a
              href={`/api/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-ivory-200 rounded-lg text-gray-600 hover:border-gold-300 hover:text-gold-700 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              {isFr ? 'Télécharger' : 'Download'}
            </a>
            <button
              onClick={enterEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-charcoal text-white rounded-lg hover:bg-charcoal/90 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              {isFr ? 'Modifier' : 'Edit'}
            </button>
            <button
              onClick={() => setDeleteOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {isFr ? 'Supprimer' : 'Delete'}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode('view')}
              disabled={saving}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isFr ? 'Enregistrer' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* ── VIEW mode ──────────────────────────────────────────────────────── */}
      {mode === 'view' && (
        <div className="space-y-4">
          {/* Client + Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Client */}
            <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                {isFr ? 'Client' : 'Client'}
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gold-100 flex items-center justify-center text-sm font-semibold text-gold-700 flex-shrink-0">
                  {getInitials(invoice.client.name)}
                </div>
                <div>
                  <Link
                    href={`/${locale}/admin/clients/${invoice.client.id}`}
                    className="font-semibold text-charcoal hover:text-gold-600 text-sm"
                  >
                    {invoice.client.name}
                  </Link>
                  <p className="text-xs text-gray-500">{invoice.client.email}</p>
                  {invoice.client.phone && (
                    <p className="text-xs text-gray-400">{invoice.client.phone}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                {isFr ? 'Récapitulatif' : 'Summary'}
              </p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{isFr ? 'Total facture' : 'Invoice total'}</span>
                  <span className="font-bold text-charcoal">{formatMAD(invoice.amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{isFr ? 'Montant réglé' : 'Amount paid'}</span>
                  <span className={`font-semibold ${invoice.paidAmount > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                    {invoice.paidAmount > 0 ? formatMAD(invoice.paidAmount) : '—'}
                  </span>
                </div>
                {remaining > 0 && (
                  <div className="flex justify-between text-sm border-t border-ivory-100 pt-2">
                    <span className="text-gray-600 font-medium">{isFr ? 'Reste à payer' : 'Remaining'}</span>
                    <span className="font-bold text-orange-600">{formatMAD(remaining)}</span>
                  </div>
                )}
                {invoice.paidAt && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{isFr ? 'Payée le' : 'Paid on'}</span>
                    <span className="text-xs text-green-600">{formatDate(invoice.paidAt, locale)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              {isFr ? 'Lignes de facture' : 'Line items'}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ivory-100">
                  <th className="text-left py-2 text-xs text-gray-400 font-medium">{isFr ? 'Description' : 'Description'}</th>
                  <th className="text-center py-2 text-xs text-gray-400 font-medium w-14">{isFr ? 'Qté' : 'Qty'}</th>
                  <th className="text-right py-2 text-xs text-gray-400 font-medium hidden sm:table-cell">{isFr ? 'P.U.' : 'Unit price'}</th>
                  <th className="text-right py-2 text-xs text-gray-400 font-medium">{isFr ? 'Total' : 'Total'}</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map(item => (
                  <tr key={item.id} className="border-b border-ivory-50 last:border-0">
                    <td className="py-2.5 text-charcoal">{item.description}</td>
                    <td className="py-2.5 text-center text-gray-500">{item.quantity}</td>
                    <td className="py-2.5 text-right text-gray-500 hidden sm:table-cell">
                      {item.unitPrice.toFixed(2)} MAD
                    </td>
                    <td className="py-2.5 text-right font-semibold text-charcoal">
                      {item.total.toFixed(2)} MAD
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ivory-200">
                  <td colSpan={3} className="py-2.5 text-sm font-semibold text-gray-600 text-right hidden sm:table-cell">
                    {isFr ? 'Total' : 'Total'}
                  </td>
                  <td colSpan={2} className="py-2.5 text-sm font-semibold text-gray-600 text-right sm:hidden">
                    {isFr ? 'Total' : 'Total'}
                  </td>
                  <td className="py-2.5 text-right font-bold text-charcoal">
                    {invoice.amount.toFixed(2)} MAD
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Payment history */}
          {invoice.payments.length > 0 && (
            <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                {isFr ? 'Historique des paiements' : 'Payment history'}
              </p>
              <div className="space-y-2">
                {invoice.payments.map(p => {
                  const Icon = METHOD_ICONS[p.paymentMethod] ?? Banknote;
                  return (
                    <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-ivory-50 last:border-0">
                      <div className="flex items-center gap-2 text-sm">
                        <Icon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        <span className="text-gray-600">
                          {METHOD_LABELS[p.paymentMethod]?.[isFr ? 'fr' : 'en'] ?? p.paymentMethod}
                        </span>
                        <span className="text-gray-400 text-xs">{fmtPaymentDate(p.paymentDate, locale)}</span>
                      </div>
                      <span className="font-semibold text-green-700 text-sm">{p.amount.toFixed(2)} MAD</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          {invoice.notes && !invoice.notes.startsWith('EXTENSION_SURCHARGE:') && (
            <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                {isFr ? 'Notes' : 'Notes'}
              </p>
              <p className="text-sm text-gray-600 italic">{invoice.notes}</p>
            </div>
          )}

          {/* Booking link */}
          {invoice.booking && (
            <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                {isFr ? 'Réservation liée' : 'Linked booking'}
              </p>
              <Link
                href={`/${locale}/admin/reservations/${invoice.booking.id}`}
                className="text-sm text-gold-600 hover:text-gold-700 font-medium hover:underline"
              >
                {invoice.booking.serviceType === 'BOARDING'
                  ? (isFr ? 'Pension' : 'Boarding')
                  : (isFr ? 'Taxi animalier' : 'Pet Taxi')}
                {invoice.booking.startDate && (
                  <> · {formatDate(invoice.booking.startDate, locale)}</>
                )}
              </Link>
              {invoice.booking.bookingPets.length > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  {invoice.booking.bookingPets.map(bp => bp.pet.name).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── EDIT mode ──────────────────────────────────────────────────────── */}
      {mode === 'edit' && (
        <div className="space-y-4">
          {/* Client */}
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
              {isFr ? 'Client' : 'Client'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  {isFr ? 'Nom *' : 'Name *'}
                </label>
                <input
                  value={editClientName}
                  onChange={e => setEditClientName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400"
                  placeholder={isFr ? 'Nom du client' : 'Client name'}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  {isFr ? 'Téléphone' : 'Phone'}
                </label>
                <input
                  value={editClientPhone}
                  onChange={e => setEditClientPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400"
                  placeholder="+212..."
                />
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {isFr ? 'Lignes de facture' : 'Line items'}
              </p>
              <button
                onClick={addItem}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-gold-700 border border-gold-300 rounded-lg hover:bg-gold-50 transition-colors"
              >
                <Plus className="h-3 w-3" />
                {isFr ? 'Ajouter une ligne' : 'Add row'}
              </button>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 px-1">
                <span className="col-span-6">{isFr ? 'Description' : 'Description'}</span>
                <span className="col-span-2 text-center">{isFr ? 'Qté' : 'Qty'}</span>
                <span className="col-span-3 text-right">{isFr ? 'Prix unit.' : 'Unit price'}</span>
                <span className="col-span-1" />
              </div>

              {editItems.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    className="col-span-6 text-sm h-8 px-2 border border-gray-200 rounded-lg focus:outline-none focus:border-gold-400"
                    value={it.description}
                    onChange={e => updateItem(i, 'description', e.target.value)}
                    placeholder={isFr ? 'Description' : 'Description'}
                  />
                  <input
                    type="number"
                    min={1}
                    className="col-span-2 text-sm h-8 px-2 border border-gray-200 rounded-lg text-center focus:outline-none focus:border-gold-400"
                    value={it.quantity}
                    onChange={e => updateItem(i, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className="col-span-3 text-sm h-8 px-2 border border-gray-200 rounded-lg text-right focus:outline-none focus:border-gold-400"
                    value={it.unitPrice}
                    onChange={e => updateItem(i, 'unitPrice', parseFloat(e.target.value) || 0)}
                  />
                  <button
                    onClick={() => removeItem(i)}
                    disabled={editItems.length === 1}
                    className="col-span-1 flex items-center justify-center text-gray-400 hover:text-red-500 disabled:opacity-20 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end mt-3 pt-2 border-t border-ivory-100">
              <span className="text-sm font-bold text-charcoal">
                Total : {editTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD
              </span>
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
              {isFr ? 'Informations' : 'Details'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Date */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  {isFr ? 'Date de facturation' : 'Invoice date'}
                </label>
                <input
                  type="date"
                  value={editIssuedAt}
                  onChange={e => setEditIssuedAt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400"
                />
              </div>

              {/* Status */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  {isFr ? 'Statut' : 'Status'}
                </label>
                <select
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400 bg-white"
                >
                  <option value="PENDING">{isFr ? 'En attente' : 'Pending'}</option>
                  <option value="PARTIALLY_PAID">{isFr ? 'Partiel' : 'Partial'}</option>
                  <option value="PAID">{isFr ? 'Payée' : 'Paid'}</option>
                  <option value="CANCELLED">{isFr ? 'Annulée' : 'Cancelled'}</option>
                </select>
              </div>

              {/* Paid amount + method — hidden when CANCELLED */}
              {editStatus !== 'CANCELLED' && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                      {isFr ? 'Montant payé (MAD)' : 'Paid amount (MAD)'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={editPaidAmount}
                      onChange={e => setEditPaidAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      {isFr ? 'Remplace tous les paiements existants' : 'Replaces all existing payments'}
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                      {isFr ? 'Mode de paiement' : 'Payment method'}
                    </label>
                    <select
                      value={editPaymentMethod}
                      onChange={e => setEditPaymentMethod(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400 bg-white"
                    >
                      <option value="CASH">{isFr ? 'Espèces' : 'Cash'}</option>
                      <option value="CARD">{isFr ? 'Carte / TPE' : 'Card / POS'}</option>
                      <option value="CHECK">{isFr ? 'Chèque' : 'Check'}</option>
                      <option value="TRANSFER">{isFr ? 'Virement bancaire' : 'Bank transfer'}</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              {isFr ? 'Notes (optionnel)' : 'Notes (optional)'}
            </label>
            <textarea
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              rows={3}
              placeholder={isFr ? 'Notes internes...' : 'Internal notes...'}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400 resize-none"
            />
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ───────────────────────────────────────── */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { if (!deleting) setDeleteOpen(false); }}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <h2 className="text-lg font-serif font-bold text-charcoal">
                {isFr ? 'Supprimer la facture ?' : 'Delete invoice?'}
              </h2>
            </div>

            <p className="text-sm font-mono font-semibold text-charcoal mb-2">
              {invoice.invoiceNumber}
            </p>
            <p className="text-sm text-gray-500 mb-6">
              {isFr
                ? 'Cette action est irréversible. Tous les paiements associés seront supprimés.'
                : 'This action cannot be undone. All associated payments will be deleted.'}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {isFr ? 'Annuler' : 'Cancel'}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                {deleting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Trash2 className="h-4 w-4" />}
                {isFr ? 'Supprimer' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
