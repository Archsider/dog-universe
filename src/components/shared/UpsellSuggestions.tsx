'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Lightbulb, Send, Plus, ShoppingBag } from 'lucide-react';
import { formatMAD } from '@/lib/utils';

type AgeCategory = 'PUPPY' | 'JUNIOR' | 'ADULT' | 'SENIOR';
type Species = 'DOG' | 'CAT';

interface UpsellProduct {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  price: number;
  stock: number;
  available: boolean;
  targetSpecies: string;
  targetAge: string;
  imageUrl: string | null;
  weight: string | null;
  supplier: string | null;
}

interface PetSuggestion {
  pet: { id: string; name: string; species: Species; ageCategory: AgeCategory };
  recommended: UpsellProduct[];
  all: UpsellProduct[];
}

interface Props {
  bookingId: string;
  context: 'client' | 'admin';
  locale: string;
  hasInvoice?: boolean;
}

const AGE_LABELS_FR: Record<AgeCategory, (s: Species) => string> = {
  PUPPY:  (s) => (s === 'DOG' ? 'Chiot' : 'Chaton'),
  JUNIOR: () => 'Jeune',
  ADULT:  () => 'Adulte',
  SENIOR: () => 'Senior (7+)',
};

const AGE_LABELS_EN: Record<AgeCategory, (s: Species) => string> = {
  PUPPY:  (s) => (s === 'DOG' ? 'Puppy' : 'Kitten'),
  JUNIOR: () => 'Junior',
  ADULT:  () => 'Adult',
  SENIOR: () => 'Senior (7+)',
};

export default function UpsellSuggestions({ bookingId, context, locale, hasInvoice = true }: Props) {
  const router = useRouter();
  const fr = locale === 'fr';
  const [suggestions, setSuggestions] = useState<PetSuggestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const url = context === 'admin'
      ? `/api/admin/products/suggestions?bookingId=${encodeURIComponent(bookingId)}`
      : `/api/client/products/suggestions?bookingId=${encodeURIComponent(bookingId)}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((d: { suggestions?: PetSuggestion[] }) => {
        if (alive) setSuggestions(d.suggestions ?? []);
      })
      .catch(() => { if (alive) setSuggestions([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [bookingId, context]);

  async function addToInvoice(productId: string, petId: string, productName: string) {
    if (!hasInvoice) {
      setError(fr ? "Créez d'abord la facture du séjour." : 'Create the invoice first.');
      return;
    }
    setBusy(`${productId}:${petId}`);
    setError(null);
    try {
      const url = context === 'admin'
        ? `/api/admin/bookings/${bookingId}/products`
        : `/api/client/bookings/${bookingId}/add-product`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId, quantity: 1 }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? 'ERROR');
      }
      router.refresh();
    } catch (err) {
      const code = err instanceof Error ? err.message : 'ERROR';
      setError(
        code === 'OUT_OF_STOCK'        ? (fr ? `Stock insuffisant pour ${productName}` : `Out of stock: ${productName}`)
        : code === 'PRODUCT_UNAVAILABLE' ? (fr ? 'Produit indisponible' : 'Product unavailable')
        : code === 'NO_INVOICE'         ? (fr ? 'Pas de facture liée' : 'No linked invoice')
        : (fr ? "Erreur lors de l'ajout" : 'Failed to add'),
      );
    } finally {
      setBusy(null);
    }
  }

  async function suggestToClient(petId: string, products: UpsellProduct[]) {
    setBusy(`suggest:${petId}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/suggest-products`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ petId, productIds: products.map((p) => p.id) }),
      });
      if (!res.ok) throw new Error('ERROR');
    } catch {
      setError(fr ? 'Échec envoi suggestion.' : 'Failed to send suggestion.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card animate-pulse">
        <div className="h-4 w-48 bg-ivory-100 rounded mb-3" />
        <div className="h-24 bg-ivory-50 rounded" />
      </div>
    );
  }
  if (!suggestions || suggestions.length === 0) return null;

  const HeaderIcon = context === 'client' ? Sparkles : Lightbulb;
  const headerLabel = context === 'client'
    ? (fr ? 'Recommandé pour vos animaux' : 'Recommended for your pets')
    : (fr ? 'Suggestions upsell' : 'Upsell suggestions');

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card space-y-5">
      <div className="flex items-center gap-2">
        <HeaderIcon className="h-5 w-5 text-gold-600" />
        <h3 className="font-semibold text-charcoal">{headerLabel}</h3>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2 py-1">{error}</p>
      )}

      {suggestions.map((s) => {
        if (s.recommended.length === 0) return null;
        const ageLabel = (fr ? AGE_LABELS_FR : AGE_LABELS_EN)[s.pet.ageCategory](s.pet.species);
        const speciesEmoji = s.pet.species === 'DOG' ? '🐕' : '🐈';

        return (
          <div key={s.pet.id} className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-charcoal">
                <span className="font-medium">{speciesEmoji} {s.pet.name}</span>
                <span className="text-gray-500"> — {ageLabel}</span>
              </p>
              {context === 'admin' && s.recommended.length > 0 && (
                <button
                  type="button"
                  onClick={() => suggestToClient(s.pet.id, s.recommended)}
                  disabled={busy === `suggest:${s.pet.id}`}
                  className="text-xs px-2 py-1 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50 inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Send className="h-3 w-3" />
                  {fr ? 'Suggérer au client' : 'Notify client'}
                </button>
              )}
            </div>

            <div className="-mx-1 overflow-x-auto">
              <div className="flex gap-3 px-1 pb-2">
                {s.recommended.map((p) => {
                  const key = `${p.id}:${s.pet.id}`;
                  const isBusy = busy === key;
                  return (
                    <div
                      key={key}
                      className="min-w-[200px] max-w-[220px] flex-shrink-0 bg-ivory-50 rounded-lg border border-ivory-200 p-3 flex flex-col gap-2"
                    >
                      <div className="h-20 bg-white rounded border border-ivory-200 flex items-center justify-center overflow-hidden">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt={p.name} className="h-full w-full object-contain" />
                        ) : (
                          <ShoppingBag className="h-7 w-7 text-gold-400" />
                        )}
                      </div>
                      <div className="flex-1 min-h-0">
                        <p className="text-xs font-medium text-charcoal line-clamp-2">{p.name}</p>
                        {p.supplier && <p className="text-[10px] text-gray-400 mt-0.5">{p.supplier}</p>}
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-base font-bold text-gold-700">{formatMAD(p.price)}</span>
                        {p.stock <= 3 && p.stock > 0 && (
                          <span className="text-[10px] text-amber-600">{fr ? `Plus que ${p.stock}` : `Only ${p.stock}`}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => addToInvoice(p.id, s.pet.id, p.name)}
                        disabled={isBusy || !hasInvoice || p.stock <= 0}
                        className="w-full px-2 py-1.5 rounded-md bg-charcoal text-white text-xs font-medium disabled:opacity-40 inline-flex items-center justify-center gap-1 hover:bg-charcoal/90"
                      >
                        <Plus className="h-3 w-3" />
                        {context === 'client'
                          ? (fr ? `Pour ${s.pet.name}` : `For ${s.pet.name}`)
                          : (fr ? 'Ajouter' : 'Add')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {context === 'client' && (
        <p className="text-[11px] text-gray-500 italic border-t border-ivory-100 pt-3">
          {fr
            ? 'Tous les produits commandés seront ajoutés à votre facture et réglés lors de la récupération de votre animal.'
            : 'All ordered products will be added to your invoice and settled when picking up your pet.'}
        </p>
      )}
    </div>
  );
}
