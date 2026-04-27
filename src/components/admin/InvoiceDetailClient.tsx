'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Pencil, Trash2, Download, Eye, Loader2, Save, X, Plus,
  Banknote, CreditCard, Receipt, Building2, MessageSquare,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDate, formatMAD, getInvoiceStatusColor, getInitials } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

// ── Types ───────────────────────────────────────────────────────────────────

type ItemCategory = 'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT' | 'OTHER';

const CATEGORY_OPTIONS: { value: ItemCategory; label: string }[] = [
  { value: 'BOARDING', label: '🏠 Pension' },
  { value: 'PET_TAXI', label: '🚗 Pet Taxi' },
  { value: 'GROOMING', label: '✂️ Toilettage / Soins' },
  { value: 'PRODUCT',  label: '🐾 Croquettes / Produits' },
  { value: 'OTHER',    label: '➕ Autre' },
];

const autoCategory = (desc: string): ItemCategory => {
  const d = desc.toLowerCase();
  if (d.includes('pension') || d.includes('nuit') || d.includes('hébergement')) return 'BOARDING';
  if (d.includes('taxi') || d.includes('transport') || d.includes('aller') || d.includes('retour')) return 'PET_TAXI';
  if (d.includes('toilettage') || d.includes('soin') || d.includes('médic') || d.includes('bain') || d.includes('coupe')) return 'GROOMING';
  if (d.includes('croquette') || d.includes('kibble') || d.includes('royal') || d.includes('grain') || d.includes('lamb') || d.includes('nourriture')) return 'PRODUCT';
  return 'OTHER';
};

interface InvoiceItemData {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  allocatedAmount: number;
  status: string;
  category?: ItemCategory;
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
  clientDisplayName: string | null;
  clientDisplayPhone: string | null;
  clientDisplayEmail: string | null;
  client: { id: string; name: string; email: string; phone: string | null };
  booking: BookingData | null;
  items: InvoiceItemData[];
  payments: PaymentData[];
}

interface EditItem {
  description: string;
  quantity: number;
  unitPrice: number;
  category: ItemCategory;
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

function getDisplayEmail(inv: { clientDisplayEmail: string | null; client: { email: string } }): string {
  if (inv.clientDisplayEmail) return inv.clientDisplayEmail;
  if (inv.client.email === 'passage@doguniverse.ma') return '';
  return inv.client.email;
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
  const [sendingSms, setSendingSms] = useState(false);

  // Edit form state
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [editIssuedAt, setEditIssuedAt] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editClientName, setEditClientName] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [editClientEmail, setEditClientEmail] = useState('');

  // Add payment form state (used in edit mode)
  const [newPaymentDate, setNewPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newPaymentAmount, setNewPaymentAmount] = useState('');
  const [newPaymentMethod, setNewPaymentMethod] = useState('CASH');
  const [addingPayment, setAddingPayment] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);

  const enterEdit = () => {
    setEditItems(invoice.items.map(it => ({
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      category: (it.category ?? 'OTHER') as ItemCategory,
    })));
    setEditIssuedAt(toDateStr(invoice.issuedAt));
    setEditNotes(invoice.notes ?? '');
    setEditStatus(invoice.status);
    setEditClientName(invoice.clientDisplayName ?? invoice.client.name);
    setEditClientPhone((invoice.clientDisplayPhone ?? invoice.client.phone) ?? '');
    setEditClientEmail(getDisplayEmail(invoice));
    const remaining = Math.max(0, invoice.amount - invoice.paidAmount);
    setNewPaymentAmount(remaining > 0 ? remaining.toFixed(2) : '');
    setNewPaymentDate(new Date().toISOString().slice(0, 10));
    setNewPaymentMethod('CASH');
    setMode('edit');
  };

  const addItem = () =>
    setEditItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0, category: 'OTHER' }]);

  const removeItem = (i: number) =>
    setEditItems(prev => prev.filter((_, idx) => idx !== i));

  const updateItem = (i: number, field: keyof EditItem, value: string | number) =>
    setEditItems(prev => prev.map((it, idx) => {
      if (idx !== i) return it;
      const next = { ...it, [field]: value } as EditItem;
      // Auto-detect category on description change — only if current category is OTHER
      if (field === 'description' && it.category === 'OTHER') {
        next.category = autoCategory(String(value));
      }
      return next;
    }));

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

    // Non-blocking warning for lines classified as OTHER
    const otherCount = editItems.filter(it => it.category === 'OTHER').length;
    if (otherCount > 0) {
      const msg = isFr
        ? `⚠️ ${otherCount} ligne(s) classée(s) dans « Autre » — les analytics seront imprécis. Continuer ?`
        : `⚠️ ${otherCount} line(s) classified as “Other” — analytics will be imprecise. Continue?`;
      if (!window.confirm(msg)) return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: editItems.map(it => ({
            description: it.description.trim(),
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            category: it.category,
          })),
          issuedAt: editIssuedAt,
          notes: editNotes,
          status: editStatus,
          clientDisplayName: editClientName.trim(),
          clientDisplayPhone: editClientPhone.trim() || null,
          clientDisplayEmail: editClientEmail.trim() || null,
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

  const refetchInvoice = async () => {
    const res = await fetch(`/api/invoices/${invoice.id}`);
    if (res.ok) {
      const data = await res.json();
      setInvoice(data);
    }
  };

  const handleAddPayment = async () => {
    const amount = parseFloat(newPaymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: isFr ? 'Montant invalide' : 'Invalid amount', variant: 'destructive' });
      return;
    }
    setAddingPayment(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, paymentMethod: newPaymentMethod, paymentDate: newPaymentDate }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || (isFr ? 'Erreur serveur' : 'Server error'));
      }
      await refetchInvoice();
      const rem = Math.max(0, invoice.amount - invoice.paidAmount);
      setNewPaymentAmount(rem > 0 ? rem.toFixed(2) : '');
      setNewPaymentDate(new Date().toISOString().slice(0, 10));
      toast({ title: isFr ? 'Paiement ajouté' : 'Payment added', variant: 'success' });
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : (isFr ? 'Erreur' : 'Error'), variant: 'destructive' });
    } finally {
      setAddingPayment(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    setDeletingPaymentId(paymentId);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/payments/${paymentId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error('Failed');
      await refetchInvoice();
      toast({ title: isFr ? 'Paiement supprimé' : 'Payment deleted', variant: 'success' });
    } catch {
      toast({ title: isFr ? 'Erreur lors de la suppression' : 'Delete failed', variant: 'destructive' });
    } finally {
      setDeletingPaymentId(null);
    }
  };

  const handleSendSms = async () => {
    setSendingSms(true);
    try {
      const res = await fetch(`/api/admin/clients/${invoice.client.id}/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'INVOICE_AVAILABLE', invoiceId: invoice.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || (isFr ? 'Erreur serveur' : 'Server error'));
      }
      toast({ title: isFr ? 'SMS envoyé au client' : 'SMS sent to client', variant: 'success' });
    } catch (e: unknown) {
      toast({
        title: e instanceof Error ? e.message : (isFr ? 'Erreur lors de l\'envoi' : 'Send failed'),
        variant: 'destructive',
      });
    } finally {
      setSendingSms(false);
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
              onClick={handleSendSms}
              disabled={sendingSms || !invoice.client.phone || invoice.status === 'CANCELLED'}
              title={
                !invoice.client.phone
                  ? (isFr ? 'Client sans téléphone' : 'No phone on file')
                  : invoice.status === 'CANCELLED'
                    ? (isFr ? 'Facture annulée' : 'Invoice cancelled')
                    : undefined
              }
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-ivory-200 rounded-lg text-gray-600 hover:border-gold-300 hover:text-gold-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sendingSms
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <MessageSquare className="h-3.5 w-3.5" />}
              {isFr ? 'Envoyer par SMS' : 'Send by SMS'}
            </button>
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
                  {getInitials(invoice.clientDisplayName ?? invoice.client.name)}
                </div>
                <div>
                  <Link
                    href={`/${locale}/admin/clients/${invoice.client.id}`}
                    className="font-semibold text-charcoal hover:text-gold-600 text-sm"
                  >
                    {invoice.clientDisplayName ?? invoice.client.name}
                  </Link>
                  {!!getDisplayEmail(invoice) && (
                    <p className="text-xs text-gray-500">{getDisplayEmail(invoice)}</p>
                  )}
                  {(invoice.clientDisplayPhone ?? invoice.client.phone) && (
                    <p className="text-xs text-gray-400">{invoice.clientDisplayPhone ?? invoice.client.phone}</p>
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
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-green-700 text-sm">{p.amount.toFixed(2)} MAD</span>
                        <button
                          onClick={() => handleDeletePayment(p.id)}
                          disabled={deletingPaymentId === p.id}
                          className="text-gray-300 hover:text-red-400 disabled:opacity-50 transition-colors"
                          title={isFr ? 'Supprimer ce paiement' : 'Delete this payment'}
                        >
                          {deletingPaymentId === p.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
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
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  {isFr ? 'Email facture' : 'Invoice email'}
                </label>
                <input
                  type="email"
                  value={editClientEmail}
                  onChange={e => setEditClientEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400"
                  placeholder="email@example.com"
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
                <span className="col-span-4">{isFr ? 'Description' : 'Description'}</span>
                <span className="col-span-3">{isFr ? 'Catégorie' : 'Category'}</span>
                <span className="col-span-1 text-center">{isFr ? 'Qté' : 'Qty'}</span>
                <span className="col-span-3 text-right">{isFr ? 'Prix unit.' : 'Unit price'}</span>
                <span className="col-span-1" />
              </div>

              {editItems.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    className="col-span-4 text-sm h-8 px-2 border border-gray-200 rounded-lg focus:outline-none focus:border-gold-400"
                    value={it.description}
                    onChange={e => updateItem(i, 'description', e.target.value)}
                    placeholder={isFr ? 'Description' : 'Description'}
                  />
                  <select
                    value={it.category}
                    onChange={e => updateItem(i, 'category', e.target.value)}
                    className={`col-span-3 text-sm h-8 px-2 rounded-lg border border-[#C4974A] bg-white focus:outline-none focus:ring-2 focus:ring-[#C4974A]/20 min-w-0 ${it.category === 'OTHER' ? 'border-l-4 border-l-amber-400' : ''}`}
                  >
                    {CATEGORY_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    className="col-span-1 text-sm h-8 px-2 border border-gray-200 rounded-lg text-center focus:outline-none focus:border-gold-400"
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

          {/* Add payment */}
          {invoice.status !== 'CANCELLED' && (
            <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
                {isFr ? 'Ajouter un paiement' : 'Add a payment'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                    {isFr ? 'Montant (MAD)' : 'Amount (MAD)'}
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={newPaymentAmount}
                    onChange={e => setNewPaymentAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                    {isFr ? 'Mode' : 'Method'}
                  </label>
                  <select
                    value={newPaymentMethod}
                    onChange={e => setNewPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400 bg-white"
                  >
                    <option value="CASH">{isFr ? 'Espèces' : 'Cash'}</option>
                    <option value="CARD">{isFr ? 'Carte / TPE' : 'Card / POS'}</option>
                    <option value="CHECK">{isFr ? 'Chèque' : 'Check'}</option>
                    <option value="TRANSFER">{isFr ? 'Virement' : 'Transfer'}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                    {isFr ? 'Date' : 'Date'}
                  </label>
                  <input
                    type="date"
                    value={newPaymentDate}
                    onChange={e => setNewPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gold-400"
                  />
                </div>
              </div>
              <button
                onClick={handleAddPayment}
                disabled={addingPayment}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 transition-colors"
              >
                {addingPayment
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Plus className="h-4 w-4" />}
                {isFr ? 'Enregistrer le paiement' : 'Record payment'}
              </button>

              {/* Existing payments in edit mode */}
              {invoice.payments.length > 0 && (
                <div className="mt-4 pt-3 border-t border-ivory-100 space-y-1.5">
                  <p className="text-xs text-gray-400 mb-2">
                    {isFr ? 'Paiements existants' : 'Existing payments'}
                  </p>
                  {invoice.payments.map(p => {
                    const Icon = METHOD_ICONS[p.paymentMethod] ?? Banknote;
                    return (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                          <span className="text-gray-500">
                            {METHOD_LABELS[p.paymentMethod]?.[isFr ? 'fr' : 'en'] ?? p.paymentMethod}
                          </span>
                          <span className="text-gray-400 text-xs">{fmtPaymentDate(p.paymentDate, locale)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-green-700">{p.amount.toFixed(2)} MAD</span>
                          <button
                            onClick={() => handleDeletePayment(p.id)}
                            disabled={deletingPaymentId === p.id}
                            className="text-gray-300 hover:text-red-400 disabled:opacity-50 transition-colors"
                            title={isFr ? 'Supprimer' : 'Delete'}
                          >
                            {deletingPaymentId === p.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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
