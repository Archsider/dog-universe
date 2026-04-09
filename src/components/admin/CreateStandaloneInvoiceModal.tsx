'use client';

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Client {
  id: string;
  name: string;
  email: string;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface CreateStandaloneInvoiceModalProps {
  clients: Client[];
  locale: string;
  onCreated?: () => void;
  /** Pre-fill and lock the client selector */
  preselectedClientId?: string;
}

const SERVICE_TYPES = [
  { value: '', fr: '— Multiple / Divers', en: '— Multiple / Miscellaneous' },
  { value: 'BOARDING', fr: 'Pension', en: 'Boarding' },
  { value: 'PET_TAXI', fr: 'Taxi animalier', en: 'Pet Taxi' },
  { value: 'GROOMING', fr: 'Toilettage', en: 'Grooming' },
  { value: 'PRODUCT_SALE', fr: 'Vente produit / Croquettes', en: 'Product Sale / Croquettes' },
];

const PAYMENT_METHODS = [
  { value: 'CASH', fr: 'Espèces', en: 'Cash' },
  { value: 'CARD', fr: 'Carte', en: 'Card' },
  { value: 'CHECK', fr: 'Chèque', en: 'Check' },
  { value: 'TRANSFER', fr: 'Virement', en: 'Transfer' },
];

const today = () => new Date().toISOString().split('T')[0];

export default function CreateStandaloneInvoiceModal({ clients, locale, onCreated, preselectedClientId }: CreateStandaloneInvoiceModalProps) {
  const fr = locale === 'fr';
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [clientId, setClientId] = useState(preselectedClientId ?? '');
  const [serviceType, setServiceType] = useState('');
  const [issuedAt, setIssuedAt] = useState(today());
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([{ description: '', quantity: 1, unitPrice: 0 }]);
  const [markPaid, setMarkPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paidAt, setPaidAt] = useState(today());

  const total = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);

  const addItem = () => setItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0 }]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof LineItem, value: string | number) => {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
  };

  const reset = () => {
    setClientId(preselectedClientId ?? '');
    setServiceType('');
    setIssuedAt(today());
    setNotes('');
    setItems([{ description: '', quantity: 1, unitPrice: 0 }]);
    setMarkPaid(false);
    setPaymentMethod('CASH');
    setPaidAt(today());
    setError('');
  };

  const handleSubmit = async () => {
    if (!clientId) { setError(fr ? 'Sélectionnez un client.' : 'Select a client.'); return; }
    if (items.some(it => !it.description.trim())) { setError(fr ? 'Tous les articles doivent avoir une description.' : 'All items must have a description.'); return; }
    if (total <= 0) { setError(fr ? 'Le total doit être supérieur à 0.' : 'Total must be greater than 0.'); return; }

    setLoading(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        clientId,
        serviceType,
        issuedAt,
        notes: notes.trim() || null,
        items: items.map(it => ({
          description: it.description.trim(),
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.quantity * it.unitPrice,
        })),
      };
      if (markPaid) {
        body.markPaid = true;
        body.paymentMethod = paymentMethod;
        body.paidAt = paidAt;
      }

      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'INTERNAL_ERROR');
      }

      setOpen(false);
      reset();
      onCreated?.();
      // Reload page to show new invoice
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : (fr ? 'Erreur inattendue.' : 'Unexpected error.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        className="flex items-center gap-1.5"
        onClick={() => { reset(); setOpen(true); }}
      >
        <Plus className="h-4 w-4" />
        {fr ? 'Créer une facture' : 'Create Invoice'}
      </Button>

      <Dialog open={open} onOpenChange={v => { if (!v) reset(); setOpen(v); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{fr ? 'Nouvelle facture' : 'New Invoice'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Client */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">{fr ? 'Client *' : 'Client *'}</Label>
                {preselectedClientId ? (
                  <div className="mt-1 w-full border border-gray-200 rounded-md text-sm px-3 py-2 bg-ivory-50 text-charcoal font-medium">
                    {clients.find(c => c.id === preselectedClientId)?.name ?? preselectedClientId}
                  </div>
                ) : (
                  <select
                    value={clientId}
                    onChange={e => setClientId(e.target.value)}
                    className="mt-1 w-full border border-gray-200 rounded-md text-sm px-3 py-2 focus:outline-none focus:border-gold-400 bg-white"
                  >
                    <option value="">{fr ? '— Sélectionner —' : '— Select —'}</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <Label className="text-xs">{fr ? 'Catégorie (optionnel)' : 'Category (optional)'}</Label>
                <select
                  value={serviceType}
                  onChange={e => setServiceType(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-md text-sm px-3 py-2 focus:outline-none focus:border-gold-400 bg-white"
                >
                  {SERVICE_TYPES.map(st => (
                    <option key={st.value} value={st.value}>{fr ? st.fr : st.en}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">{fr ? 'Laissez "Multiple" pour combiner plusieurs services' : 'Leave "Multiple" to combine several services'}</p>
              </div>
            </div>

            {/* Date */}
            <div className="w-48">
              <Label className="text-xs">{fr ? 'Date de facturation' : 'Invoice date'}</Label>
              <Input
                type="date"
                value={issuedAt}
                onChange={e => setIssuedAt(e.target.value)}
                className="mt-1 text-sm"
              />
            </div>

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">{fr ? 'Articles *' : 'Items *'}</Label>
                <Button size="sm" variant="outline" onClick={addItem} className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" />{fr ? 'Ajouter' : 'Add'}
                </Button>
              </div>

              <div className="space-y-2">
                {/* Header */}
                <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 px-1">
                  <span className="col-span-6">{fr ? 'Description' : 'Description'}</span>
                  <span className="col-span-2 text-center">{fr ? 'Qté' : 'Qty'}</span>
                  <span className="col-span-3 text-right">{fr ? 'Prix unitaire' : 'Unit price'}</span>
                  <span className="col-span-1" />
                </div>

                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <Input
                      className="col-span-6 text-sm h-8"
                      value={it.description}
                      onChange={e => updateItem(i, 'description', e.target.value)}
                      placeholder={fr ? 'ex: Croquettes Royal Canin 10kg' : 'e.g. Royal Canin 10kg kibbles'}
                    />
                    <Input
                      type="number"
                      min={1}
                      className="col-span-2 text-sm h-8 text-center"
                      value={it.quantity}
                      onChange={e => updateItem(i, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                    />
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      className="col-span-3 text-sm h-8 text-right"
                      value={it.unitPrice}
                      onChange={e => updateItem(i, 'unitPrice', parseFloat(e.target.value) || 0)}
                    />
                    <button
                      onClick={() => removeItem(i)}
                      disabled={items.length === 1}
                      className="col-span-1 flex items-center justify-center text-gray-400 hover:text-red-500 disabled:opacity-20"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end mt-3 pt-2 border-t border-gray-100">
                <span className="text-sm font-bold text-charcoal">
                  Total : {total.toLocaleString()} MAD
                </span>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs">{fr ? 'Notes (optionnel)' : 'Notes (optional)'}</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="mt-1 text-sm"
                placeholder={fr ? 'Informations complémentaires…' : 'Additional information…'}
              />
            </div>

            {/* Mark as paid */}
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={markPaid}
                  onChange={e => setMarkPaid(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-gold-500"
                />
                <span className="text-sm font-medium text-charcoal">
                  {fr ? 'Marquer comme payée immédiatement' : 'Mark as paid immediately'}
                </span>
              </label>

              {markPaid && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <Label className="text-xs">{fr ? 'Moyen de paiement' : 'Payment method'}</Label>
                    <select
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value)}
                      className="mt-1 w-full border border-gray-200 rounded-md text-sm px-3 py-2 focus:outline-none focus:border-gold-400 bg-white"
                    >
                      {PAYMENT_METHODS.map(m => (
                        <option key={m.value} value={m.value}>{fr ? m.fr : m.en}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">{fr ? 'Date de paiement' : 'Payment date'}</Label>
                    <Input
                      type="date"
                      value={paidAt}
                      onChange={e => setPaidAt(e.target.value)}
                      className="mt-1 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
            )}
          </div>

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
