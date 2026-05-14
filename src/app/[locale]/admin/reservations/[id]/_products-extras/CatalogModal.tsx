'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import { type BookingItem, type CatalogProduct, t } from './types';

interface Props {
  bookingId: string;
  locale: string;
  onClose: () => void;
  onAdded: (it: BookingItem) => void;
}

/**
 * Catalog picker — fetches /api/admin/products on mount, surfaces a
 * search bar (name + brand + reference), and POSTs the selected
 * product as a `type: 'catalog'` BookingItem.
 *
 * Out-of-stock products are visually disabled (50% opacity + add button
 * greyed). Low-stock indicator is informational only.
 */
export function CatalogModal({ bookingId, locale, onClose, onAdded }: Props) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/products?archived=false')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setProducts(data as CatalogProduct[]))
      .catch(() => setProducts([]));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.brand?.toLowerCase().includes(q) ?? false) ||
        (p.reference?.toLowerCase().includes(q) ?? false),
    );
  }, [products, search]);

  async function addProduct(p: CatalogProduct, quantity: number) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'catalog', productId: p.id, quantity }),
    });
    setBusy(false);
    if (res.ok) {
      onAdded(await res.json());
      onClose();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'ERROR');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="px-5 py-3 border-b border-ivory-100 flex items-center justify-between">
          <h2 className="font-semibold text-charcoal">
            {t('Choisir un produit', 'Pick a product', locale)}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-charcoal">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(
              'Rechercher (nom, marque, réf.)',
              'Search (name, brand, ref.)',
              locale,
            )}
            className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
            autoFocus
          />
          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          <ul className="divide-y divide-ivory-100">
            {filtered.length === 0 && (
              <li className="py-4 text-sm text-gray-400 italic text-center">
                {t('Aucun produit', 'No products', locale)}
              </li>
            )}
            {filtered.map((p) => {
              const outOfStock = p.stock <= 0;
              const lowStock =
                p.lowStockThreshold != null &&
                p.lowStockThreshold > 0 &&
                p.stock <= p.lowStockThreshold &&
                !outOfStock;
              return (
                <li
                  key={p.id}
                  className={`py-2 flex items-center gap-3 ${outOfStock ? 'opacity-50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-charcoal truncate">
                      {p.name}
                      {p.brand && (
                        <span className="text-gray-400 font-normal"> · {p.brand}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatMAD(p.price)} · {t('Stock', 'Stock', locale)} {p.stock}
                      {outOfStock && (
                        <span className="ml-2 text-red-700">
                          {t('Rupture', 'Out of stock', locale)}
                        </span>
                      )}
                      {lowStock && (
                        <span className="ml-2 text-amber-700">
                          {t('Stock bas', 'Low stock', locale)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => addProduct(p, 1)}
                    disabled={busy || outOfStock}
                    className="px-3 py-1 rounded-md bg-charcoal text-white text-xs font-medium hover:bg-charcoal/90 disabled:opacity-50"
                  >
                    {t('Ajouter', 'Add', locale)}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
