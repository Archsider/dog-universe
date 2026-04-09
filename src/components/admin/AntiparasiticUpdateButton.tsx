'use client';

import { useState } from 'react';
import { Syringe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

const KNOWN_PRODUCTS = [
  { value: 'NexGard', label: 'NexGard (30j)' },
  { value: 'Simparica', label: 'Simparica (30j)' },
  { value: 'Bravecto', label: 'Bravecto (84j)' },
  { value: 'Frontline', label: 'Frontline (30j)' },
];

interface AntiparasiticUpdateButtonProps {
  petId: string;
  locale: string;
  currentDate?: string | null;
  currentProduct?: string | null;
  currentNotes?: string | null;
  currentDurationDays?: number | null;
}

export default function AntiparasiticUpdateButton({
  petId,
  locale,
  currentDate,
  currentProduct,
  currentNotes,
  currentDurationDays,
}: AntiparasiticUpdateButtonProps) {
  const fr = locale === 'fr';
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  function detectProductKey(product: string | null | undefined): string {
    if (!product) return '';
    if (KNOWN_PRODUCTS.some(p => p.value === product)) return product;
    return 'OTHER';
  }

  const [date, setDate] = useState(currentDate ? currentDate.split('T')[0] : today);
  const [productKey, setProductKey] = useState(detectProductKey(currentProduct));
  const [customProduct, setCustomProduct] = useState(
    detectProductKey(currentProduct) === 'OTHER' ? (currentProduct ?? '') : ''
  );
  const [notes, setNotes] = useState(currentNotes ?? '');
  const [durationDays, setDurationDays] = useState(currentDurationDays ? String(currentDurationDays) : '');

  const handleOpen = () => {
    setDate(currentDate ? currentDate.split('T')[0] : today);
    setProductKey(detectProductKey(currentProduct));
    setCustomProduct(detectProductKey(currentProduct) === 'OTHER' ? (currentProduct ?? '') : '');
    setNotes(currentNotes ?? '');
    setDurationDays(currentDurationDays ? String(currentDurationDays) : '');
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!date) {
      toast({ title: fr ? 'La date est obligatoire' : 'Date is required', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const antiparasiticProduct = productKey === 'OTHER'
        ? (customProduct.trim() || null)
        : (productKey || null);

      const payload = {
        lastAntiparasiticDate: date,
        antiparasiticProduct,
        antiparasiticNotes: notes.trim() || null,
        antiparasiticDurationDays: durationDays ? parseInt(durationDays, 10) : null,
      };

      const res = await fetch(`/api/pets/${petId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed');

      toast({ title: fr ? 'Antiparasitaire mis à jour !' : 'Anti-parasitic updated!', variant: 'success' });
      setOpen(false);
      window.location.reload();
    } catch {
      toast({ title: fr ? 'Erreur lors de la mise à jour' : 'Update failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="text-xs text-gold-600 hover:text-gold-700 flex items-center gap-1 border border-gold-200 rounded px-2 py-1 transition-colors hover:bg-gold-50"
      >
        <Syringe className="h-3 w-3" />
        {fr ? 'Mettre à jour' : 'Update'}
      </button>

      <Dialog open={open} onOpenChange={v => { if (!v) setOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Syringe className="h-4 w-4 text-gold-500" />
              {fr ? 'Traitement antiparasitaire' : 'Anti-parasitic treatment'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">{fr ? 'Date du traitement *' : 'Treatment date *'}</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  max={today}
                  className="mt-1 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">{fr ? 'Produit utilisé' : 'Product used'}</Label>
                <Select
                  value={productKey}
                  onValueChange={v => {
                    setProductKey(v);
                    if (v !== 'OTHER') setCustomProduct('');
                  }}
                >
                  <SelectTrigger className="mt-1 text-sm">
                    <SelectValue placeholder={fr ? '— Non renseigné' : '— Not specified'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{fr ? '— Non renseigné' : '— Not specified'}</SelectItem>
                    {KNOWN_PRODUCTS.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                    <SelectItem value="OTHER">{fr ? 'Autre…' : 'Other…'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {productKey === 'OTHER' && (
              <div>
                <Label className="text-xs">{fr ? 'Nom du produit' : 'Product name'}</Label>
                <Input
                  value={customProduct}
                  onChange={e => setCustomProduct(e.target.value)}
                  className="mt-1 text-sm"
                  placeholder={fr ? 'Ex: Seresto, Advantix…' : 'Ex: Seresto, Advantix…'}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">
                  {fr ? 'Durée protection (jours)' : 'Protection duration (days)'}
                </Label>
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={durationDays}
                  onChange={e => setDurationDays(e.target.value)}
                  className="mt-1 text-sm"
                  placeholder={fr ? 'Défaut selon produit' : 'Default per product'}
                />
              </div>
              <div>
                <Label className="text-xs">{fr ? 'Notes (optionnel)' : 'Notes (optional)'}</Label>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="mt-1 text-sm"
                  rows={2}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              {fr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button onClick={handleSubmit} disabled={loading || !date}>
              {loading ? (fr ? 'Enregistrement…' : 'Saving…') : (fr ? 'Enregistrer' : 'Save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
