'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMAD } from '@/lib/utils';
import { Trash2, Plus, FileText, Pencil, X } from 'lucide-react';

type Category =
  | 'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT' | 'OTHER'
  | 'DISCOUNT' | 'EXTRA_SERVICE' | 'MISC_FEE';

type BookingItem = {
  id: string;
  productId: string | null;
  invoiceItemId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  category: Category;
  version: number;
};

type CatalogProduct = {
  id: string;
  name: string;
  brand?: string | null;
  reference?: string | null;
  price: number;
  stock: number;
  lowStockThreshold?: number | null;
  category?: string | null;
  targetSpecies?: string | null;
};

type Props = {
  bookingId: string;
  hasInvoice: boolean;
  initialItems: BookingItem[];
  locale: string;
};

const t = (fr: string, en: string, locale: string) => (locale === 'en' ? en : fr);

const FREE_CATEGORIES: Category[] = ['EXTRA_SERVICE', 'MISC_FEE', 'DISCOUNT'];
const CATEGORY_LABEL: Record<Category, { fr: string; en: string; tone: string }> = {
  BOARDING:      { fr: 'Pension',         en: 'Boarding',       tone: 'bg-gold-100 text-gold-800' },
  PET_TAXI:      { fr: 'Taxi',            en: 'Taxi',           tone: 'bg-blue-100 text-blue-700' },
  GROOMING:      { fr: 'Toilettage',      en: 'Grooming',       tone: 'bg-purple-100 text-purple-700' },
  PRODUCT:       { fr: 'Produit',         en: 'Product',        tone: 'bg-emerald-100 text-emerald-700' },
  OTHER:         { fr: 'Autre',           en: 'Other',          tone: 'bg-gray-100 text-gray-700' },
  DISCOUNT:      { fr: 'Remise',          en: 'Discount',       tone: 'bg-amber-100 text-amber-700' },
  EXTRA_SERVICE: { fr: 'Service extra',   en: 'Extra service',  tone: 'bg-indigo-100 text-indigo-700' },
  MISC_FEE:      { fr: 'Frais divers',    en: 'Misc fee',       tone: 'bg-slate-100 text-slate-700' },
};

export default function ProductsExtrasSection({ bookingId, hasInvoice, initialItems, locale }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<BookingItem[]>(initialItems);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showFree, setShowFree] = useState(false);
  const [editing, setEditing] = useState<BookingItem | null>(null);

  const sumTotal = useMemo(() => items.reduce((s, i) => s + i.total, 0), [items]);
  const unbilledCount = useMemo(() => items.filter((i) => !i.invoiceItemId).length, [items]);

  async function refresh() {
    const res = await fetch(`/api/admin/bookings/${bookingId}/items`);
    if (res.ok) setItems(await res.json());
  }

  async function deleteItem(it: BookingItem) {
    if (!confirm(t('Supprimer cette ligne ?', 'Delete this line?', locale))) return;
    setBusy(true);
    const res = await fetch(`/api/admin/bookings/${bookingId}/items/${it.id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.status === 204) {
      setItems((prev) => prev.filter((x) => x.id !== it.id));
      router.refresh();
    }
  }

  async function generateSupplementary() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/invoices/supplementary`, { method: 'POST' });
    setBusy(false);
    if (res.status === 201) {
      await refresh();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'ERROR');
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-charcoal flex items-center gap-2">
          <span>{t('Produits & Extras', 'Products & Extras', locale)}</span>
          {items.length > 0 && <span className="text-xs text-gray-500">({items.length})</span>}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCatalog(true)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> {t('Produit catalogue', 'Catalogue', locale)}
          </button>
          <button
            onClick={() => setShowFree(true)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-200 text-charcoal text-xs font-medium hover:bg-gray-300 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> {t('Ligne libre', 'Free line', locale)}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 italic">
          {t('Aucun produit ou extra ajouté.', 'No products or extras added.', locale)}
        </p>
      ) : (
        <ul className="divide-y divide-ivory-100">
          {items.map((it) => {
            const cfg = CATEGORY_LABEL[it.category] ?? CATEGORY_LABEL.OTHER;
            const billed = !!it.invoiceItemId;
            const isCatalog = !!it.productId;
            return (
              <li key={it.id} className="py-2 flex items-center gap-3">
                <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${cfg.tone}`}>
                  {locale === 'en' ? cfg.en : cfg.fr}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-charcoal truncate">{it.description}</div>
                  <div className="text-xs text-gray-500">
                    {it.quantity} × {formatMAD(it.unitPrice)}
                    {billed && (
                      <span className="ml-2 text-emerald-700">✓ {t('Facturé', 'Billed', locale)}</span>
                    )}
                    {!billed && hasInvoice && (
                      <span className="ml-2 text-amber-700">{t('En attente facture compl.', 'Pending supplementary', locale)}</span>
                    )}
                  </div>
                </div>
                <div className="text-sm font-semibold text-charcoal">{formatMAD(it.total)}</div>
                {!billed && (
                  <div className="flex items-center gap-1">
                    {!isCatalog && (
                      <button
                        onClick={() => setEditing(it)}
                        disabled={busy}
                        className="p-1 text-gray-400 hover:text-gold-600"
                        title={t('Modifier', 'Edit', locale)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteItem(it)}
                      disabled={busy}
                      className="p-1 text-gray-400 hover:text-red-600"
                      title={t('Supprimer', 'Delete', locale)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {items.length > 0 && (
        <div className="flex justify-between items-center pt-2 border-t border-ivory-100 text-sm">
          <span className="text-gray-500">{t('Total Produits & Extras', 'Products & Extras total', locale)}</span>
          <span className="font-bold text-charcoal">{formatMAD(sumTotal)}</span>
        </div>
      )}

      {hasInvoice && unbilledCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-center justify-between gap-3">
          <div className="text-xs text-amber-800">
            {t(
              `${unbilledCount} ligne(s) non-facturée(s). Une facture complémentaire peut être générée.`,
              `${unbilledCount} unbilled line(s). A supplementary invoice can be issued.`,
              locale,
            )}
          </div>
          <button
            onClick={generateSupplementary}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50 flex-shrink-0"
          >
            <FileText className="h-3.5 w-3.5" /> {t('Facture compl.', 'Supplementary inv.', locale)}
          </button>
        </div>
      )}

      {showCatalog && (
        <CatalogModal
          bookingId={bookingId}
          locale={locale}
          onClose={() => setShowCatalog(false)}
          onAdded={(created) => {
            setItems((prev) => [...prev, created]);
            router.refresh();
          }}
        />
      )}

      {showFree && (
        <FreeLineModal
          bookingId={bookingId}
          locale={locale}
          existing={null}
          onClose={() => setShowFree(false)}
          onSaved={(created) => {
            setItems((prev) => [...prev, created]);
            router.refresh();
          }}
        />
      )}

      {editing && (
        <FreeLineModal
          bookingId={bookingId}
          locale={locale}
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ─── Catalog picker modal ───────────────────────────────────────────────────
function CatalogModal({
  bookingId, locale, onClose, onAdded,
}: {
  bookingId: string;
  locale: string;
  onClose: () => void;
  onAdded: (it: BookingItem) => void;
}) {
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
          <button onClick={onClose} className="text-gray-400 hover:text-charcoal"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Rechercher (nom, marque, réf.)', 'Search (name, brand, ref.)', locale)}
            className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
            autoFocus
          />
          {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          <ul className="divide-y divide-ivory-100">
            {filtered.length === 0 && (
              <li className="py-4 text-sm text-gray-400 italic text-center">
                {t('Aucun produit', 'No products', locale)}
              </li>
            )}
            {filtered.map((p) => {
              const outOfStock = p.stock <= 0;
              const lowStock = p.lowStockThreshold != null && p.lowStockThreshold > 0 && p.stock <= p.lowStockThreshold && !outOfStock;
              return (
                <li key={p.id} className={`py-2 flex items-center gap-3 ${outOfStock ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-charcoal truncate">
                      {p.name}
                      {p.brand && <span className="text-gray-400 font-normal"> · {p.brand}</span>}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatMAD(p.price)} · {t('Stock', 'Stock', locale)} {p.stock}
                      {outOfStock && <span className="ml-2 text-red-700">{t('Rupture', 'Out of stock', locale)}</span>}
                      {lowStock && <span className="ml-2 text-amber-700">{t('Stock bas', 'Low stock', locale)}</span>}
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

// ─── Free line modal (create + edit) ────────────────────────────────────────
function FreeLineModal({
  bookingId, locale, existing, onClose, onSaved,
}: {
  bookingId: string;
  locale: string;
  existing: BookingItem | null;
  onClose: () => void;
  onSaved: (it: BookingItem) => void;
}) {
  const initial = existing ?? null;
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<Category>(
    (initial?.category && FREE_CATEGORIES.includes(initial.category)) ? initial.category : 'EXTRA_SERVICE',
  );
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 1));
  const [unitPrice, setUnitPrice] = useState(String(initial?.unitPrice ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const qty = parseInt(quantity, 10);
    const price = parseFloat(unitPrice);
    if (!description.trim() || isNaN(qty) || qty < 1 || isNaN(price)) {
      setError(t('Champs invalides', 'Invalid fields', locale));
      setBusy(false);
      return;
    }
    if (category === 'DISCOUNT' && price > 0) {
      setError(t('Une remise doit avoir un prix négatif ou nul.', 'A discount must have a non-positive price.', locale));
      setBusy(false);
      return;
    }

    if (existing) {
      const res = await fetch(`/api/admin/bookings/${bookingId}/items/${existing.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          version: existing.version,
          description: description.trim(),
          category,
          quantity: qty,
          unitPrice: price,
        }),
      });
      setBusy(false);
      if (res.ok) { onSaved(await res.json()); onClose(); }
      else { setError((await res.json().catch(() => ({}))).error ?? 'ERROR'); }
    } else {
      const res = await fetch(`/api/admin/bookings/${bookingId}/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'free',
          description: description.trim(),
          category,
          quantity: qty,
          unitPrice: price,
        }),
      });
      setBusy(false);
      if (res.ok) { onSaved(await res.json()); onClose(); }
      else { setError((await res.json().catch(() => ({}))).error ?? 'ERROR'); }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <form onSubmit={save} className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-charcoal">
            {existing ? t('Modifier la ligne', 'Edit line', locale) : t('Nouvelle ligne libre', 'New free line', locale)}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-charcoal"><X className="h-4 w-4" /></button>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('Description *', 'Description *', locale)}</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('Catégorie *', 'Category *', locale)}</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm"
            >
              {FREE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{locale === 'en' ? CATEGORY_LABEL[c].en : CATEGORY_LABEL[c].fr}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('Quantité *', 'Quantity *', locale)}</label>
            <input
              type="number" min={1} step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {t('Prix unitaire (MAD) *', 'Unit price (MAD) *', locale)}
            {category === 'DISCOUNT' && (
              <span className="ml-1 text-amber-700">({t('négatif pour remise', 'negative for discount', locale)})</span>
            )}
          </label>
          <input
            type="number" step={0.01}
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm"
            required
          />
        </div>
        {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            {t('Annuler', 'Cancel', locale)}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-1.5 rounded-lg bg-charcoal text-white text-sm font-medium disabled:opacity-50 hover:bg-charcoal/90"
          >
            {busy ? '…' : existing ? t('Enregistrer', 'Save', locale) : t('Ajouter', 'Add', locale)}
          </button>
        </div>
      </form>
    </div>
  );
}
