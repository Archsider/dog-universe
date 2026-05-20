'use client';

// Client product ordering — refonte Wave 5 polish round 2.
//
// Was a flat 2-col grid with no filter, no search, mixed species.  Now :
//   - Auto-filtered by the booking's pet species (CAT booking never shows
//     DOG-only products) — gated server-side via /api/client/products
//     ?bookingId=<id>
//   - Search box (debounced 200ms)
//   - Category chips with counts
//   - Product cards with image, brand, weight, price, stock badge
//
// Source : user feedback ('tout mélangé chiens et chats, niveau de salope
// finie ptdr').

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { ShoppingBag, PackageOpen, Search, X } from 'lucide-react';
import { formatMAD } from '@/lib/utils';

interface CatalogProduct {
  id: string;
  name: string;
  brand: string | null;
  reference: string | null;
  category: string | null;
  price: number;
  stock: number;
  targetSpecies: string;
  targetAge?: string;
  imageUrl?: string | null;
  weight?: string | null;
  description?: string | null;
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
  initialItems: OrderedItem[];
}

const CATEGORY_LABELS: Record<string, { fr: string; en: string; ar: string }> = {
  FOOD:      { fr: 'Alimentation', en: 'Food',      ar: 'طعام' },
  TREAT:     { fr: 'Friandises',   en: 'Treats',    ar: 'حلويات' },
  TOY:       { fr: 'Jouets',       en: 'Toys',      ar: 'ألعاب' },
  CARE:      { fr: 'Soins',        en: 'Care',      ar: 'عناية' },
  ACCESSORY: { fr: 'Accessoires',  en: 'Accessories', ar: 'إكسسوارات' },
  HEALTH:    { fr: 'Santé',        en: 'Health',    ar: 'صحة' },
};

function categoryLabel(cat: string | null, locale: string): string {
  if (!cat) return locale === 'fr' ? 'Autre' : locale === 'ar' ? 'أخرى' : 'Other';
  const upper = cat.toUpperCase();
  const entry = CATEGORY_LABELS[upper];
  if (entry) return entry[locale === 'fr' ? 'fr' : locale === 'ar' ? 'ar' : 'en'];
  return cat;
}

function speciesEmoji(species: string): string {
  if (species === 'DOG') return '🐶';
  if (species === 'CAT') return '🐱';
  return '🐾';
}

export default function ClientProductOrder({ bookingId, locale, initialItems }: ClientProductOrderProps) {
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [orderedItems, setOrderedItems] = useState<OrderedItem[]>(initialItems);
  const [adding, setAdding] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const t = (fr: string, en: string, ar?: string) => {
    if (locale === 'en') return en;
    if (locale === 'ar') return ar ?? fr;
    return fr;
  };

  // Debounce search 200 ms — keeps the filter snappy without thrashing.
  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(search.toLowerCase().trim()), 200);
    return () => clearTimeout(h);
  }, [search]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/client/products?bookingId=${encodeURIComponent(bookingId)}`)
      .then((r) => r.json())
      .then((data) => { if (alive && Array.isArray(data)) setCatalog(data); })
      .catch(() => {})
      .finally(() => { if (alive) setLoadingCatalog(false); });
    return () => { alive = false; };
  }, [bookingId]);

  async function addProduct(p: CatalogProduct) {
    setAdding(p.id);
    try {
      const r = await fetch(`/api/client/bookings/${bookingId}/order-product`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId: p.id, quantity: 1 }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setToast(j.error ?? t('Erreur', 'Error'));
        setTimeout(() => setToast(null), 3000);
        return;
      }
      const j = await r.json();
      const newItem: OrderedItem = {
        id: j.itemId ?? `tmp-${Date.now()}`,
        description: p.name,
        quantity: 1,
        total: p.price,
      };
      setOrderedItems((prev) => [...prev, newItem]);
      setToast(t(`${p.name} ajouté à votre commande`, `${p.name} added`));
      setTimeout(() => setToast(null), 2500);
    } catch {
      setToast(t('Erreur réseau', 'Network error'));
      setTimeout(() => setToast(null), 3000);
    } finally {
      setAdding(null);
    }
  }

  // Compute category counts for the chip strip.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of catalog) {
      const key = (p.category ?? 'OTHER').toUpperCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [catalog]);

  // Filtered list — apply category + search.
  const visible = useMemo(() => {
    return catalog.filter((p) => {
      if (activeCategory !== 'ALL') {
        const cat = (p.category ?? 'OTHER').toUpperCase();
        if (cat !== activeCategory) return false;
      }
      if (debouncedSearch) {
        const hay = `${p.name} ${p.brand ?? ''} ${p.category ?? ''}`.toLowerCase();
        if (!hay.includes(debouncedSearch)) return false;
      }
      return true;
    });
  }, [catalog, activeCategory, debouncedSearch]);

  if (loadingCatalog) {
    return (
      <div className="rounded-xl border border-[#F0D98A]/30 bg-white p-4 space-y-2">
        <div className="h-4 bg-[#FAF6F0] rounded animate-pulse w-1/3" />
        <div className="h-20 bg-[#FAF6F0] rounded animate-pulse" />
      </div>
    );
  }

  if (catalog.length === 0) {
    return (
      <div className="rounded-xl border border-[#F0D98A]/30 bg-white p-4 flex flex-col items-center gap-2 text-gray-400">
        <PackageOpen className="h-8 w-8" />
        <p className="text-sm">{t('Aucun produit adapté pour le moment.', 'No matching products right now.', 'لا توجد منتجات متاحة الآن.')}</p>
      </div>
    );
  }

  const totalOrdered = orderedItems.reduce((acc, it) => acc + Number(it.total ?? 0), 0);

  return (
    <div className="rounded-xl border border-[#F0D98A]/40 bg-white p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-[#C4974A]" />
          <h3 className="font-serif font-bold text-charcoal text-lg">
            {t('Boutique', 'Shop', 'متجر')}
          </h3>
        </div>
        <span className="text-xs text-charcoal/50">
          {catalog.length} {t('produit', 'product')}{catalog.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Info — slim */}
      <p className="text-xs text-charcoal/60 bg-[#FFF9E8] border border-[#F0D98A]/30 rounded-lg px-3 py-2 leading-relaxed">
        {t(
          'Filtré pour les besoins de votre compagnon. Réglé à la récupération.',
          'Filtered for your companion\'s needs.  Settled at pickup.',
          'تم تصفيتها لاحتياجات صديقك. يتم الدفع عند الاستلام.',
        )}
      </p>

      {/* Search */}
      <div className="relative">
        <Search className="absolute top-1/2 -translate-y-1/2 left-3 h-4 w-4 text-charcoal/40" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('Rechercher un produit, une marque…', 'Search products, brands…', 'البحث عن منتج، علامة تجارية...')}
          className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-[#F0D98A]/40 bg-[#FAF6F0]/50 focus:bg-white focus:border-[#C4974A]/60 focus:outline-none focus:ring-2 focus:ring-[#C4974A]/15 text-sm placeholder-charcoal/30"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label={t('Effacer', 'Clear')}
            className="absolute top-1/2 -translate-y-1/2 right-3 text-charcoal/40 hover:text-charcoal"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        <CategoryChip
          active={activeCategory === 'ALL'}
          onClick={() => setActiveCategory('ALL')}
          label={t('Tout', 'All', 'الكل')}
          count={catalog.length}
        />
        {[...categoryCounts.entries()]
          .sort(([, a], [, b]) => b - a)
          .map(([key, count]) => (
            <CategoryChip
              key={key}
              active={activeCategory === key}
              onClick={() => setActiveCategory(key)}
              label={categoryLabel(key, locale)}
              count={count}
            />
          ))}
      </div>

      {/* Product grid */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-charcoal/40">
          <PackageOpen className="h-8 w-8" />
          <p className="text-sm">{t('Aucun produit ne correspond.', 'No matching product.', 'لا يوجد منتج مطابق.')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visible.map((product) => {
            const outOfStock = product.stock === 0;
            const lowStock = product.stock > 0 && product.stock <= 3;
            return (
              <div
                key={product.id}
                className={`flex items-stretch gap-3 rounded-xl border p-3 transition-all ${
                  outOfStock
                    ? 'border-gray-100 bg-gray-50 opacity-60'
                    : 'border-[#F0D98A]/40 bg-white hover:border-[#C4974A]/50 hover:shadow-md'
                }`}
              >
                {/* Image / icon block */}
                <div className="flex-shrink-0 w-16 h-16 bg-[#FAF6F0] rounded-lg flex items-center justify-center border border-[#F0D98A]/30 overflow-hidden relative">
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      width={64}
                      height={64}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <span className="text-2xl">{speciesEmoji(product.targetSpecies)}</span>
                  )}
                  {lowStock && !outOfStock && (
                    <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[8px] font-bold px-1 rounded-full">
                      {product.stock}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <p className="text-sm font-semibold text-charcoal line-clamp-2 leading-tight">
                      {product.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-charcoal/50">
                      {product.brand && <span className="truncate">{product.brand}</span>}
                      {product.weight && <span>· {product.weight}</span>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-sm font-bold text-[#C4974A]">{formatMAD(product.price)}</p>
                    {outOfStock ? (
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-1 rounded">
                        {t('Rupture', 'Out', 'نفاد')}
                      </span>
                    ) : (
                      <button
                        onClick={() => addProduct(product)}
                        disabled={adding === product.id}
                        className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-[#C4974A] hover:bg-[#8B6914] text-white text-xs font-medium disabled:opacity-50 transition-colors"
                      >
                        {adding === product.id ? '…' : '+ ' + t('Ajouter', 'Add', 'إضافة')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Order summary */}
      {orderedItems.length > 0 && (
        <div className="pt-4 border-t border-[#F0D98A]/40">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-wider text-[#8B6914] font-semibold">
              {t('Ma commande', 'My order', 'طلبي')}
            </p>
            <p className="text-sm font-bold text-charcoal">{formatMAD(totalOrdered)}</p>
          </div>
          <ul className="space-y-1.5 text-sm">
            {orderedItems.map((it) => (
              <li
                key={it.id}
                className={`flex justify-between items-center ${it.pending ? 'opacity-50' : ''}`}
              >
                <span className="text-charcoal/80">
                  {it.description}{it.quantity > 1 ? ` × ${it.quantity}` : ''}
                </span>
                <span className="text-charcoal font-medium">{formatMAD(it.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-charcoal text-white text-sm px-4 py-2 rounded-full shadow-lg z-50 animate-in fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}

function CategoryChip({
  active, onClick, label, count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
        active
          ? 'bg-[#C4974A] text-white shadow-sm'
          : 'bg-[#FAF6F0] text-charcoal/70 border border-[#F0D98A]/40 hover:border-[#C4974A]/60'
      }`}
    >
      {label}
      <span className={`text-[10px] ${active ? 'text-white/70' : 'text-charcoal/40'}`}>
        ({count})
      </span>
    </button>
  );
}
