'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMAD } from '@/lib/utils';

interface Product {
  id: string;
  name: string;
  brand: string | null;
  reference: string | null;
  price: number;
  stock: number;
}

interface InvoiceItemView {
  id: string;
  description: string;
  quantity: number;
  total: number;
  category: string;
  // Optimistic-only flag — true while the server hasn't ACK'd
  pending?: boolean;
}

interface AddProductSectionProps {
  bookingId: string;
  hasInvoice: boolean;
  initialItems: InvoiceItemView[];
  startDate: string;          // ISO
  endDate: string | null;     // ISO or null
  isOpenEnded: boolean;
  pricePerNight: number;
  locale: string;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export default function AddProductSection({
  bookingId,
  hasInvoice,
  initialItems,
  startDate,
  endDate,
  isOpenEnded,
  pricePerNight,
  locale,
}: AddProductSectionProps) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<InvoiceItemView[]>(initialItems);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/products')
      .then((r) => r.json())
      .then((data: Product[]) => {
        if (alive) setProducts(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoadingProducts(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Provisional total = real_nights × pricePerNight + sum(invoice items)
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  const diffMs = Math.max(0, end.getTime() - start.getTime());
  const provisionalNights = Math.max(1, Math.ceil(diffMs / MS_PER_DAY));
  const productsTotal = items
    .filter((i) => i.category !== 'BOARDING')
    .reduce((acc, i) => acc + i.total, 0);
  const provisionalTotal = provisionalNights * pricePerNight + productsTotal;

  const t = (fr: string, en: string) => (locale === 'en' ? en : fr);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId || quantity <= 0) return;
    if (!hasInvoice) {
      setError(t('Pas de facture liée', 'No linked invoice'));
      return;
    }
    setSubmitting(true);
    setError(null);

    const product = products.find((p) => p.id === productId);
    if (!product) {
      setSubmitting(false);
      return;
    }
    const tempId = `tmp_${Date.now()}`;
    const optimistic: InvoiceItemView = {
      id: tempId,
      description: [product.name, product.brand, product.reference ? `réf. ${product.reference}` : null]
        .filter(Boolean)
        .join(' · '),
      quantity,
      total: Number((product.price * quantity).toFixed(2)),
      category: 'PRODUCT',
      pending: true,
    };
    setItems((prev) => [...prev, optimistic]);

    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/products`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId, quantity }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'ERROR');
      }
      const created: InvoiceItemView = await res.json();
      setItems((prev) => prev.map((it) => (it.id === tempId ? { ...created } : it)));
      setProductId('');
      setQuantity(1);
      router.refresh();
    } catch (err) {
      setItems((prev) => prev.filter((it) => it.id !== tempId));
      const code = err instanceof Error ? err.message : 'ERROR';
      const msg =
        code === 'OUT_OF_STOCK'
          ? t('Stock insuffisant', 'Out of stock')
          : code === 'PRODUCT_UNAVAILABLE'
          ? t('Produit indisponible', 'Product unavailable')
          : code === 'NO_INVOICE'
          ? t('Pas de facture liée', 'No linked invoice')
          : t("Erreur lors de l'ajout", 'Failed to add product');
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
      <h3 className="font-semibold text-charcoal mb-3 text-sm">
        {t('Ajouter un produit', 'Add a product')}
      </h3>

      {!hasInvoice && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mb-3">
          {t(
            'Créez d’abord une facture pour ce séjour avant d’ajouter des produits.',
            'Create an invoice for this booking first before adding products.',
          )}
        </p>
      )}

      <form onSubmit={submit} className="space-y-2">
        <div className="flex gap-2">
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            disabled={loadingProducts || submitting || !hasInvoice}
            className="flex-1 border border-ivory-200 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">
              {loadingProducts ? t('Chargement…', 'Loading…') : t('— Choisir un produit —', '— Pick a product —')}
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {[p.name, p.brand].filter(Boolean).join(' · ')} · {formatMAD(p.price)} · stock {p.stock}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={1000}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-20 border border-ivory-200 rounded-md px-2 py-1.5 text-sm"
            disabled={submitting || !hasInvoice}
          />
          <button
            type="submit"
            disabled={!productId || submitting || !hasInvoice}
            className="px-3 py-1.5 rounded-md bg-charcoal text-white text-sm disabled:opacity-50"
          >
            {submitting ? t('…', '…') : t('Ajouter', 'Add')}
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>

      {items.length > 0 && (
        <div className="mt-4 space-y-1">
          <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
            {t('Lignes facturées', 'Invoiced lines')}
          </p>
          <ul className="divide-y divide-ivory-100 text-sm">
            {items.map((it) => (
              <li key={it.id} className="flex justify-between py-1">
                <span className={it.pending ? 'text-gray-400 italic' : 'text-charcoal'}>
                  {it.description} × {it.quantity}
                </span>
                <span className={it.pending ? 'text-gray-400' : 'text-charcoal font-medium'}>
                  {formatMAD(it.total)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-ivory-100 text-sm">
        <div className="flex justify-between text-gray-500">
          <span>
            {t('Nuits', 'Nights')} ({provisionalNights}) × {formatMAD(pricePerNight)}
            {isOpenEnded && <span className="ml-1 italic">— {t('en cours', 'in progress')}</span>}
          </span>
          <span>{formatMAD(provisionalNights * pricePerNight)}</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>{t('Produits', 'Products')}</span>
          <span>{formatMAD(productsTotal)}</span>
        </div>
        <div className="flex justify-between font-semibold text-charcoal mt-1">
          <span>{t('Total provisoire', 'Provisional total')}</span>
          <span>{formatMAD(provisionalTotal)}</span>
        </div>
      </div>
    </div>
  );
}
