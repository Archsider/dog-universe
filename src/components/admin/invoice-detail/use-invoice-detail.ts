'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import { submitPayment } from '@/app/[locale]/admin/billing/_lib/submit-payment';
import {
  autoCategory,
  getDisplayEmail,
  toDateStr,
  type EditItem,
  type InvoiceData,
  type ItemCategory,
} from './lib';

export function useInvoiceDetail(initialInvoice: InvoiceData, locale: string) {
  const isFr = locale === 'fr';
  const router = useRouter();

  const [invoice, setInvoice] = useState<InvoiceData>(initialInvoice);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);

  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [editIssuedAt, setEditIssuedAt] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editClientName, setEditClientName] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [editClientEmail, setEditClientEmail] = useState('');

  const [newPaymentDate, setNewPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newPaymentAmount, setNewPaymentAmount] = useState('');
  const [newPaymentMethod, setNewPaymentMethod] = useState('CASH');
  const [newPaymentSendSms, setNewPaymentSendSms] = useState(!invoice.client.isWalkIn);
  const [addingPayment, setAddingPayment] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);

  const enterEdit = () => {
    setEditItems(invoice.items.map(it => ({
      description: it.description,
      quantity: it.quantity,
      unitPrice: Number(it.unitPrice),
      category: (it.category ?? 'OTHER') as ItemCategory,
      productId: it.productId ?? null,
    })));
    setEditIssuedAt(toDateStr(invoice.issuedAt));
    setEditNotes(invoice.notes ?? '');
    setEditStatus(invoice.status);
    setEditClientName(invoice.clientDisplayName ?? invoice.client.name);
    setEditClientPhone((invoice.clientDisplayPhone ?? invoice.client.phone) ?? '');
    setEditClientEmail(getDisplayEmail(invoice));
    const remaining = Math.max(0, Number(invoice.amount) - Number(invoice.paidAmount));
    setNewPaymentAmount(remaining > 0 ? remaining.toFixed(2) : '');
    setNewPaymentDate(new Date().toISOString().slice(0, 10));
    setNewPaymentMethod('CASH');
    setMode('edit');
  };

  const addItem = () =>
    setEditItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0, category: 'OTHER', productId: null }]);

  const removeItem = (i: number) =>
    setEditItems(prev => prev.filter((_, idx) => idx !== i));

  const updateItem = (i: number, field: keyof EditItem, value: string | number) =>
    setEditItems(prev => prev.map((it, idx) => {
      if (idx !== i) return it;
      const next = { ...it, [field]: value } as EditItem;
      if (field === 'description' && it.category === 'OTHER') {
        next.category = autoCategory(String(value));
      }
      return next;
    }));

  // Multi-field patch — used by the product catalog search to set
  // description + unitPrice + productId + category atomically.
  const patchItem = (i: number, patch: Partial<EditItem>) =>
    setEditItems(prev => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

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
    if (editItems.some(it => !Number.isFinite(it.quantity) || it.quantity < 1)) {
      toast({ title: isFr ? 'La quantité doit être au moins 1' : 'Quantity must be at least 1', variant: 'destructive' });
      return;
    }
    // Mirror of server Zod refine PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID: a
    // PRODUCT line must be linked to a catalog product before save.
    if (editItems.some(it => it.category === 'PRODUCT' && !it.productId)) {
      toast({ title: isFr ? 'Une ligne « Produit » doit être liée au catalogue.' : 'A "Product" line must be linked to the catalog.', variant: 'destructive' });
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
            productId: it.category === 'PRODUCT' ? (it.productId ?? null) : null,
          })),
          issuedAt: editIssuedAt,
          notes: editNotes,
          status: editStatus,
          clientDisplayName: editClientName.trim(),
          clientDisplayPhone: editClientPhone.trim() || null,
          clientDisplayEmail: editClientEmail.trim() || null,
          version: invoice.version,
        }),
      });
      if (res.status === 409) {
        toast({
          title: isFr
            ? 'Cette facture a été modifiée par quelqu\'un d\'autre. Veuillez rafraîchir.'
            : 'This record was modified by someone else. Please refresh.',
          variant: 'destructive',
        });
        return;
      }
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
      // Same canonical submitter the PaymentModal uses. Carries the
      // Idempotency-Key + sendClientSms flag so the respectful-SMS
      // policy (ADR-0008) applies here too — previously this code path
      // bypassed the toggle entirely and always SMS'd the client.
      const result = await submitPayment({
        invoiceId: invoice.id,
        amount,
        paymentMethod: newPaymentMethod as 'CASH' | 'CARD' | 'CHECK' | 'TRANSFER',
        paymentDate: newPaymentDate,
        sendClientSms: newPaymentSendSms,
      });
      if (!result.ok) {
        throw new Error(result.error || (isFr ? 'Erreur serveur' : 'Server error'));
      }
      await refetchInvoice();
      const rem = Math.max(0, Number(invoice.amount) - Number(invoice.paidAmount));
      setNewPaymentAmount(rem > 0 ? rem.toFixed(2) : '');
      setNewPaymentDate(new Date().toISOString().slice(0, 10));
      // Reset the toggle to the context default for the next entry.
      setNewPaymentSendSms(!invoice.client.isWalkIn);
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

  const remaining = Math.max(0, Number(invoice.amount) - Number(invoice.paidAmount));

  return {
    isFr,
    invoice,
    mode, setMode,
    saving, sendingSms,
    deleteOpen, setDeleteOpen,
    deleting,
    editItems, editTotal,
    editIssuedAt, setEditIssuedAt,
    editNotes, setEditNotes,
    editStatus, setEditStatus,
    editClientName, setEditClientName,
    editClientPhone, setEditClientPhone,
    editClientEmail, setEditClientEmail,
    newPaymentDate, setNewPaymentDate,
    newPaymentAmount, setNewPaymentAmount,
    newPaymentMethod, setNewPaymentMethod,
    newPaymentSendSms, setNewPaymentSendSms,
    addingPayment,
    deletingPaymentId,
    enterEdit,
    addItem, removeItem, updateItem, patchItem,
    handleSave,
    handleAddPayment,
    handleDeletePayment,
    handleSendSms,
    handleDelete,
    remaining,
  };
}
