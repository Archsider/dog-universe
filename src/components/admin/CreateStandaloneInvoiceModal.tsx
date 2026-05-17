'use client';

import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InvoiceFormBody } from './standalone-invoice/InvoiceFormBody';
import {
  type LineItem,
  type CatalogProduct,
  type QuickAddPreset,
  autoCategory,
  today,
} from './standalone-invoice/types';

interface Client {
  id: string;
  name: string;
  email: string;
}

interface CreateStandaloneInvoiceModalProps {
  clients?: Client[];
  locale: string;
  onCreated?: () => void;
  preselectedClientId?: string;
  preselectedClientName?: string;
}

export default function CreateStandaloneInvoiceModal({ clients, locale, onCreated, preselectedClientId, preselectedClientName }: CreateStandaloneInvoiceModalProps) {
  const fr = locale === 'fr';
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clientId, setClientId] = useState(preselectedClientId ?? '');
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [issuedAt, setIssuedAt] = useState(today());
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([{ description: '', quantity: 1, unitPrice: 0, category: 'OTHER' }]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [markPaid, setMarkPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paidAt, setPaidAt] = useState(today());

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/products')
      .then(r => r.ok ? r.json() : [])
      .then((data: CatalogProduct[]) => { if (alive && Array.isArray(data)) setCatalog(data.filter(p => p.available !== false)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const productLabel = (p: CatalogProduct) => p.brand ? `${p.name} — ${p.brand}` : p.name;
  const total = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);

  const addItem = () => setItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0, category: 'OTHER' }]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const patchItem = (i: number, patch: Partial<LineItem>) => {
    setItems(prev => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };
  const updateItem = (i: number, field: keyof LineItem, value: string | number | undefined) => {
    setItems(prev => prev.map((it, idx) => {
      if (idx !== i) return it;
      const next = { ...it, [field]: value } as LineItem;
      if (field === 'description') {
        const raw = String(value).trim().toLowerCase();
        const matched = raw ? catalog.find(p => productLabel(p).toLowerCase() === raw) : undefined;
        if (matched) { next.productId = matched.id; next.unitPrice = matched.price; next.category = 'PRODUCT'; }
        else { next.productId = undefined; if (it.category === 'OTHER') next.category = autoCategory(String(value)); }
      }
      return next;
    }));
  };

  const addPreset = (preset: QuickAddPreset) => {
    setItems(prev => {
      const isEmpty = prev.length === 1 && !prev[0].description && prev[0].unitPrice === 0;
      const newItem: LineItem = { description: fr ? preset.descriptionFr : preset.descriptionEn, quantity: 1, unitPrice: preset.defaultPrice, category: preset.category };
      return isEmpty ? [newItem] : [...prev, newItem];
    });
    if (preset.serviceType && !serviceType) setServiceType(preset.serviceType);
  };

  const reset = () => {
    setClientId(preselectedClientId ?? ''); setWalkInName(''); setWalkInPhone('');
    setServiceType(''); setIssuedAt(today()); setNotes('');
    setItems([{ description: '', quantity: 1, unitPrice: 0, category: 'OTHER' }]);
    setMarkPaid(false); setPaymentMethod('CASH'); setPaidAt(today()); setError('');
  };

  const handleSubmit = async () => {
    if (!clientId) { setError(fr ? 'Sélectionnez un client.' : 'Select a client.'); return; }
    if (clientId === 'WALK_IN' && !walkInName.trim()) { setError(fr ? 'Le nom du client de passage est obligatoire.' : 'Walk-in client name is required.'); return; }
    if (items.some(it => !it.description.trim())) { setError(fr ? 'Tous les articles doivent avoir une description.' : 'All items must have a description.'); return; }
    // Mirror of server Zod rule PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID — block
    // submit early so the user sees the inline warning rather than a generic
    // server 400.
    if (items.some(it => it.category === 'PRODUCT' && !it.productId)) {
      setError(fr ? 'Une ligne « Produit » doit être liée au catalogue.' : 'A "Product" line must be linked to the catalog.');
      return;
    }
    if (total <= 0) { setError(fr ? 'Le total doit être supérieur à 0.' : 'Total must be greater than 0.'); return; }
    const otherCount = items.filter(it => it.category === 'OTHER').length;
    if (otherCount > 0 && !window.confirm(fr ? `⚠️ ${otherCount} ligne(s) classée(s) dans « Autre » — les analytics seront imprécis. Continuer ?` : `⚠️ ${otherCount} line(s) classified as "Other" — analytics will be imprecise. Continue?`)) return;

    setLoading(true); setError('');
    try {
      let resolvedClientId = clientId;
      if (clientId === 'WALK_IN') {
        const wiRes = await fetch('/api/admin/walkin-clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: walkInName.trim(), phone: walkInPhone.trim() || null }) });
        if (!wiRes.ok) throw new Error(fr ? 'Erreur création client de passage.' : 'Failed to create walk-in client.');
        resolvedClientId = (await wiRes.json()).id;
      }
      const body: Record<string, unknown> = {
        clientId: resolvedClientId, serviceType, issuedAt, notes: notes.trim() || null,
        items: items.map(it => ({ description: it.description.trim(), quantity: it.quantity, unitPrice: it.unitPrice, total: it.quantity * it.unitPrice, category: it.category, ...(it.productId ? { productId: it.productId } : {}) })),
      };
      if (markPaid) { body.markPaid = true; body.paymentMethod = paymentMethod; body.paidAt = paidAt; }
      const res = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || 'INTERNAL_ERROR'); }
      setOpen(false); reset(); onCreated?.(); window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : (fr ? 'Erreur inattendue.' : 'Unexpected error.'));
    } finally { setLoading(false); }
  };

  return (
    <>
      <Button size="sm" className="flex items-center gap-1.5" onClick={() => { reset(); setOpen(true); }}>
        <Plus className="h-4 w-4" />
        {fr ? 'Créer une facture' : 'Create Invoice'}
      </Button>
      <Dialog open={open} onOpenChange={v => { if (!v) reset(); setOpen(v); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{fr ? 'Nouvelle facture' : 'New Invoice'}</DialogTitle>
          </DialogHeader>
          <InvoiceFormBody
            locale={locale} clientId={clientId} onClientIdChange={setClientId}
            walkInName={walkInName} onWalkInNameChange={setWalkInName}
            walkInPhone={walkInPhone} onWalkInPhoneChange={setWalkInPhone}
            preselectedClientId={preselectedClientId} preselectedClientName={preselectedClientName} clients={clients}
            serviceType={serviceType} onServiceTypeChange={setServiceType}
            issuedAt={issuedAt} onIssuedAtChange={setIssuedAt}
            items={items} catalog={catalog}
            onAddItem={addItem} onRemoveItem={removeItem} onUpdateItem={updateItem} onPatchItem={patchItem} onAddPreset={addPreset}
            notes={notes} onNotesChange={setNotes}
            markPaid={markPaid} paymentMethod={paymentMethod} paidAt={paidAt}
            onMarkPaidChange={setMarkPaid} onPaymentMethodChange={setPaymentMethod} onPaidAtChange={setPaidAt}
            error={error}
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }} disabled={loading}>
              {fr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button onClick={handleSubmit} disabled={loading || total <= 0}>
              {loading ? (fr ? 'Création…' : 'Creating…') : (fr ? 'Créer la facture' : 'Create Invoice')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
