'use client';

import { useEffect, useState } from 'react';
import { ShoppingBag, PackageOpen } from 'lucide-react';
import { formatMAD } from '@/lib/utils';

interface CatalogProduct {
  id: string;
  name: string;
  brand: string | null;
  reference: string | null;
  category: string | null;
  price: number;
  stock: number;
}

interface OrderedItem {
  id: string;
  description: string;
  quantity: number;
  total: number;
  pending?: boolean;
}

interface ClientProductOrderProps {
  bookingId: string;
  locale: string;
  /** Pre-existing PRODUCT items already on the invoice */
  initialItems: OrderedItem[];
}

export default function ClientProductOrder({ bookingId, locale, initialItems }: ClientProductOrderProps) {
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [orderedItems, setOrderedItems] = useState<OrderedItem[]>(initialItems);
  const [adding, setAdding] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const t = (fr: string, en: string, ar?: string) => {
    if (locale === 'en') return en;
    if (locale === 'ar') return ar ?? fr;
    return fr;
  };

  useEffect(() => {
    let alive = true;
    fetch('/api/client/products')
      .then((r) => r.json())
      .then((data) => { if (alive && Array.isArray(data)) setCatalog(data); })
      .catch(() => {})
      .finally(() => { if (alive) setLoadingCatalog(false); });
    return () => { alive = false; };
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function addProduct(product: CatalogProduct) {
    setAdding(product.id);
    const tempId = `tmp_${Date.now()}`;
    const optimistic: OrderedItem = {
      id: tempId,
      description: [product.name, product.brand].filter(Boolean).join(' · '),
      quantity: 1,
      total: product.price,
      pending: true,
    };
    setOrderedItems((prev) => [...prev, optimistic]);

    try {
      const res = await fetch(`/api/client/bookings/${bookingId}/add-product`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setOrderedItems((prev) => prev.filter((i) => i.id !== tempId));
        const code = data?.error ?? 'ERROR';
        if (code === 'OUT_OF_STOCK') showToast(t('Stock insuffisant', 'Out of stock', 'المخزون غير كافٍ'));
        else if (code === 'PRODUCT_UNAVAILABLE') showToast(t('Produit indisponible', 'Product unavailable', 'المنتج غير متاح'));
        else showToast(t("Erreur lors de l'ajout", 'Failed to add product', 'فشل إضافة المنتج'));
        return;
      }
      const created: OrderedItem = await res.json();
      setOrderedItems((prev) => prev.map((i) => i.id === tempId ? { ...created, pending: false } : i));
      showToast(t('Produit ajouté à votre facture ✓', 'Product added to your invoice ✓', 'تمت إضافة المنتج إلى فاتورتك ✓'));
      // Refresh stock count in catalog
      setCatalog((prev) => prev.map((p) => p.id === product.id ? { ...p, stock: Math.max(0, p.stock - 1) } : p));
    } finally {
      setAdding(null);
    }
  }

  if (loadingCatalog) {
    return (
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <ShoppingBag className="h-4 w-4 text-gold-500" />
          <h3 className="font-semibold text-charcoal text-sm">{t('Commander un produit', 'Order a product', 'طلب منتج')}</h3>
        </div>
        <p className="text-sm text-gray-400">{t('Chargement…', 'Loading…', 'جارٍ التحميل…')}</p>
      </div>
    );
  }

  const availableProducts = catalog.filter((p) => p.stock > 0);

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card space-y-4">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-charcoal text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 text-gold-500" />
        <h3 className="font-semibold text-charcoal text-sm">{t('Commander un produit', 'Order a product', 'طلب منتج')}</h3>
      </div>

      {/* Info message */}
      <p className="text-xs text-gray-500 bg-[#FAF6F0] border border-[#F0D98A]/30 rounded-lg px-3 py-2">
        {t(
          'Les produits commandés seront ajoutés à votre facture et réglés lors de la récupération de votre animal.',
          'Ordered products will be added to your invoice and settled at pickup.',
          'سيتم إضافة المنتجات المطلوبة إلى فاتورتك وتسديدها عند استلام حيوانك.',
        )}
      </p>

      {/* Catalog cards */}
      {availableProducts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-4 text-gray-400">
          <PackageOpen className="h-8 w-8" />
          <p className="text-sm">{t('Aucun produit disponible en ce moment.', 'No products available right now.', 'لا توجد منتجات متاحة الآن.')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {catalog.map((product) => {
            const outOfStock = product.stock === 0;
            return (
              <div
                key={product.id}
                className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${outOfStock ? 'border-gray-100 bg-gray-50 opacity-60' : 'border-[#F0D98A]/40 bg-white hover:bg-[#FAF6F0]'}`}
              >
                {/* Icon placeholder */}
                <div className="flex-shrink-0 w-10 h-10 bg-[#FAF6F0] rounded-lg flex items-center justify-center border border-[#F0D98A]/30">
                  <ShoppingBag className="h-5 w-5 text-gold-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-charcoal truncate">{product.name}</p>
                  {product.brand && <p className="text-xs text-gray-400 truncate">{product.brand}</p>}
                  <p className="text-sm font-semibold text-gold-600">{formatMAD(product.price)}</p>
                </div>
                {outOfStock ? (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                    {t('Indisponible', 'Unavailable', 'غير متاح')}
                  </span>
                ) : (
                  <button
                    onClick={() => addProduct(product)}
                    disabled={adding === product.id}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-charcoal text-white text-xs font-medium disabled:opacity-50 hover:bg-charcoal/90 transition-colors"
                  >
                    {adding === product.id ? '…' : t('Ajouter', 'Add', 'إضافة')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* "Ma commande" summary */}
      {orderedItems.length > 0 && (
        <div className="pt-3 border-t border-ivory-100">
          <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
            {t('Ma commande', 'My order', 'طلبي')}
          </p>
          <ul className="space-y-1 text-sm">
            {orderedItems.map((it) => (
              <li key={it.id} className={`flex justify-between ${it.pending ? 'opacity-50' : ''}`}>
                <span className="text-charcoal">{it.description}{it.quantity > 1 ? ` × ${it.quantity}` : ''}</span>
                <span className="text-charcoal font-medium">{formatMAD(it.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
