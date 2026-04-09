'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, History } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';

interface Props {
  clientId: string;
  initialStays: number;
  initialSpend: number;
  initialNote: string | null;
  locale: string;
}

export default function HistoricalDataForm({ clientId, initialStays, initialSpend, initialNote, locale }: Props) {
  const isFr = locale === 'fr';
  const router = useRouter();

  const [stays, setStays] = useState(String(initialStays));
  const [spend, setSpend] = useState(String(initialSpend));
  const [note, setNote] = useState(initialNote ?? '');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    const staysVal = Math.max(0, parseInt(stays, 10) || 0);
    const spendVal = Math.max(0, parseFloat(spend) || 0);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historicalStays: staysVal,
          historicalSpendMAD: spendVal,
          historicalNote: note.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({
        title: isFr ? 'Historique enregistré' : 'History saved',
        description: isFr ? 'Le grade de fidélité a été recalculé automatiquement.' : 'Loyalty grade recalculated automatically.',
        variant: 'success',
      });
      setOpen(false);
      router.refresh();
    } catch {
      toast({ title: isFr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const hasData = initialStays > 0 || initialSpend > 0;

  return (
    <div className="mt-3 pt-3 border-t border-ivory-100">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <History className="h-3.5 w-3.5" />
          <span className="font-medium">{isFr ? 'Historique avant l\'app' : 'Pre-app history'}</span>
        </div>
        <button
          onClick={() => setOpen(v => !v)}
          className="text-xs text-gold-600 hover:text-gold-800 hover:underline font-medium"
        >
          {open ? (isFr ? 'Masquer' : 'Hide') : (isFr ? 'Modifier' : 'Edit')}
        </button>
      </div>

      {!open && hasData && (
        <div className="text-xs text-gray-500 space-y-0.5">
          {initialStays > 0 && <p>{isFr ? `${initialStays} séjour(s) importé(s)` : `${initialStays} imported stay(s)`}</p>}
          {initialSpend > 0 && <p>{isFr ? `${initialSpend.toLocaleString('fr-MA')} MAD importés` : `${initialSpend.toLocaleString('en-US')} MAD imported`}</p>}
          {initialNote && <p className="italic text-gray-400">{initialNote}</p>}
        </div>
      )}
      {!open && !hasData && (
        <p className="text-xs text-gray-400 italic">{isFr ? 'Aucune donnée historique' : 'No historical data'}</p>
      )}

      {open && (
        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="hist-stays" className="text-xs">
                {isFr ? 'Séjours importés' : 'Imported stays'}
              </Label>
              <Input
                id="hist-stays"
                type="number"
                min="0"
                value={stays}
                onChange={e => setStays(e.target.value)}
                className="mt-1 h-8 text-sm"
                placeholder="0"
              />
            </div>
            <div>
              <Label htmlFor="hist-spend" className="text-xs">
                {isFr ? 'CA importé (MAD)' : 'Imported spend (MAD)'}
              </Label>
              <Input
                id="hist-spend"
                type="number"
                min="0"
                step="0.01"
                value={spend}
                onChange={e => setSpend(e.target.value)}
                className="mt-1 h-8 text-sm"
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="hist-note" className="text-xs">{isFr ? 'Note interne (optionnel)' : 'Internal note (optional)'}</Label>
            <Textarea
              id="hist-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="mt-1 text-sm"
              rows={2}
              placeholder={isFr ? 'Ex: données extraites du carnet client papier…' : 'Ex: imported from paper records…'}
            />
          </div>
          <p className="text-xs text-amber-600">
            {isFr
              ? 'Ces valeurs s\'ajoutent aux séjours et revenus réels de l\'app pour le calcul du grade fidélité (sauf si override manuel actif).'
              : 'These values are added to real app stays/revenue for loyalty grade calculation (unless manual override is active).'}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 h-8 text-xs"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1 h-8 text-xs"
              onClick={handleSave}
              disabled={loading}
            >
              {loading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              {isFr ? 'Enregistrer' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
