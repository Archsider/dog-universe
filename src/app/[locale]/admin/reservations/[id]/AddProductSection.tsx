'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMAD } from '@/lib/utils';
import { Trash2 } from 'lucide-react';

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
  unitPrice: number;
  total: number;
  category: string;
  productId?: string | null;
  pending?: boolean;
}

interface AddProductSectionProps {
  bookingId: string;
  hasInvoice: boolean;
  initialItems: InvoiceItemView[];
  startDate: string;
  endDate: string | null;
  isOpenEnded: boolean;
  pricePerNight: number;
  petCount: number;
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
  petCount,
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

  // Per-item states for inline edit / delete
  const [editQty, setEditQty] = useState<Record<string, number>>({});
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [deletingItem, setDeletingItem] = useState<string | null>(null);

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
    return () => { alive = false; };
  }, []);

  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  const diffMs = Math.max(0, end.getTime() - start.getTime());
  const provisionalNights = Math.max(1, Math.ceil(diffMs / MS_PER_DAY));
  const safePetCount = Math.max(1, petCount);
  const boardingTotal = provisionalNights * pricePerNight * safePetCount;
  const productsTotal = items
    .filter((i) => i.category !== 'BOARDING')
    .reduce((acc, i) => acc + i.total, 0);
  const provisionalTotal = boardingTotal + productsTotal;

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
    if (!product) { setSubmitting(false); return; }

    const tempId = `tmp_${Date.now()}`;
    const optimistic: InvoiceItemView = {
      id: tempId,
      description: [product.name, product.brand, product.reference ? `réf. ${product.reference}` : null]
        .filter(Boolean).join(' · '),
      quantity,
      unitPrice: product.price,
      total: Number((product.price * quantity).toFixed(2)),
      category: 'PRODUCT',
      // Bind productId on the optimistic view to mirror the server-side
      // InvoiceItem shape (Zod refine PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID
      // + DB CHECK InvoiceItem_product_category_has_productId).
      productId: product.id,
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
      setItems((prev) => prev.map((it) => it.id === tempId ? { ...created, pending: false } : it));
      setProductId('');
      setQuantity(1);
      router.refresh();
    } catch (err) {
      setItems((prev) => prev.filter((it) => it.id !== tempId));
      const code = err instanceof Error ? err.message : 'ERROR';
      const msg =
        code === 'OUT_OF_STOCK' ? t('Stock insuffisant', 'Out of stock')
        : code === 'PRODUCT_UNAVAILABLE' ? t('Produit indisponible', 'Product unavailable')
        : code === 'NO_INVOICE' ? t('Pas de facture liée', 'No linked invoice')
        : t("Erreur lors de l'ajout", 'Failed to add product');
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function updateQty(item: InvoiceItemView) {
    const newQty = editQty[item.id];
    if (!newQty || newQty === item.quantity || newQty <= 0) {
      setEditQty((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
      return;
    }
    setSavingItem(item.id);
    const res = await fetch(`/api/admin/bookings/${bookingId}/update-product/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: newQty }),
    });
    if (res.ok) {
      const updated: InvoiceItemView = await res.json();
      setItems((prev) => prev.map((it) => it.id === item.id ? { ...updated } : it));
      setEditQty((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
      router.refresh();
    }
    setSavingItem(null);
  }

  async function deleteItem(item: InvoiceItemView) {
    if (item.pending) return;
    setDeletingItem(item.id);
    const res = await fetch(`/api/admin/bookings/${bookingId}/remove-product/${item.id}`, {
      method: 'DELETE',
    });
    if (res.status === 204) {
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      router.refresh();
    }
    setDeletingItem(null);
  }

  const productItems = items.filter((i) => i.category === 'PRODUCT');
  const otherItems = items.filter((i) => i.category !== 'PRODUCT' && i.category !== 'BOARDING');

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
      <h3 className="font-semibold text-charcoal mb-3 text-sm">
        {t('Ajouter un produit', 'Add a product')}
      </h3>

      {!hasInvoice && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mb-3">
          {t(
            "Créez d'abord une facture pour ce séjour avant d'ajouter des produits.",
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

      {/* Product items list with inline edit + delete */}
      {productItems.length > 0 && (
        <div className="mt-4 space-y-1">
          <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">
            {t('Produits facturés', 'Billed products')}
          </p>
          <ul className="divide-y divide-ivory-100 text-sm">
            {productItems.map((it) => {
              const isEditing = editQty[it.id] !== undefined;
              const isSaving = savingItem === it.id;
              const isDeleting = deletingItem === it.id;
              return (
                <li key={it.id} className="flex items-center gap-2 py-1.5">
                  <span className={`flex-1 text-xs ${it.pending ? 'text-gray-400 italic' : 'text-charcoal'}`}>
                    {it.description}
                  </span>
                  {/* Inline qty edit */}
                  {it.pending ? (
                    <span className="text-xs text-gray-400">× {it.quantity}</span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={isEditing ? editQty[it.id] : it.quantity}
                        onChange={(e) => {
                          const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                          setEditQty((prev) => ({ ...prev, [it.id]: v }));
                        }}
                        onBlur={() => updateQty(it)}
                        onKeyDown={(e) => e.key === 'Enter' && updateQty(it)}
                        disabled={isSaving || isDeleting}
                        className="w-14 border border-ivory-200 rounded px-1.5 py-0.5 text-xs text-center"
                      />
                    </div>
                  )}
                  <span className={`text-xs font-medium w-20 text-right ${it.pending ? 'text-gray-400' : 'text-charcoal'}`}>
                    {formatMAD(it.total)}
                  </span>
                  {!it.pending && (
                    <button
                      onClick={() => deleteItem(it)}
                      disabled={isDeleting || isSaving}
                      className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
                      title={t('Supprimer', 'Remove')}
                    >
                      {isDeleting ? <span className="text-xs">…</span> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Other non-boarding, non-product items */}
      {otherItems.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">
            {t('Autres lignes facturées', 'Other invoiced lines')}
          </p>
          <ul className="divide-y divide-ivory-100 text-sm">
            {otherItems.map((it) => (
              <li key={it.id} className="flex justify-between py-1 text-xs">
                <span className="text-charcoal">{it.description} × {it.quantity}</span>
                <span className="text-charcoal font-medium">{formatMAD(it.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Provisional total */}
      <div className="mt-3 pt-3 border-t border-ivory-100 text-sm">
        <div className="flex justify-between text-gray-500">
          <span>
            {t('Nuits', 'Nights')} ({provisionalNights}) × {formatMAD(pricePerNight)} ×{' '}
            {safePetCount} {safePetCount > 1 ? t('animaux', 'pets') : t('animal', 'pet')}
            {(isOpenEnded || !endDate) && <span className="ml-1 italic">— {t('en cours', 'in progress')}</span>}
          </span>
          <span>{formatMAD(boardingTotal)}</span>
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
