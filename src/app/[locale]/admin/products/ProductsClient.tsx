'use client';

import { useState } from 'react';
import { formatMAD } from '@/lib/utils';
import { Package, Plus, Pencil, Archive, ArchiveRestore, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  brand: string | null;
  reference: string | null;
  category: string | null;
  description?: string | null;
  price: number;
  costPrice?: number | null;
  stock: number;
  lowStockThreshold?: number | null;
  available: boolean;
  isArchived?: boolean;
  version?: number;
  targetSpecies?: string;
  targetAge?: string;
  supplier?: string | null;
  weight?: string | null;
  imageUrl?: string | null;
  createdAt: string;
}

const SPECIES_LABEL: Record<string, string> = { DOG: 'Chien', CAT: 'Chat', BOTH: 'Tous' };
const AGE_LABEL: Record<string, string> = {
  PUPPY: 'Chiot/Chaton', JUNIOR: 'Jeune', ADULT: 'Adulte', SENIOR: 'Senior', ALL: 'Tout âge',
};

interface ProductsClientProps {
  locale: string;
  initialProducts: Product[];
  stockValue: number;
}

const t = (fr: string, en: string, locale: string) => (locale === 'en' ? en : fr);

function StockBadge({ stock }: { stock: number }) {
  if (stock === 0) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      <XCircle className="h-3 w-3" /> Rupture
    </span>
  );
  if (stock <= 5) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
      <AlertTriangle className="h-3 w-3" /> Stock faible ({stock})
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      <CheckCircle className="h-3 w-3" /> {stock}
    </span>
  );
}

const EMPTY_FORM = {
  name: '', brand: '', reference: '', category: '', description: '',
  price: '', costPrice: '', stock: '0', lowStockThreshold: '', available: true,
  targetSpecies: 'BOTH', targetAge: 'ALL', supplier: '', weight: '', imageUrl: '',
};

const PRODUCT_CATEGORIES = ['FOOD', 'TOY', 'ACCESSORY', 'GROOMING', 'HEALTH', 'OTHER'] as const;
const CATEGORY_LABEL_FR: Record<string, string> = {
  FOOD: 'Nourriture', TOY: 'Jouet', ACCESSORY: 'Accessoire',
  GROOMING: 'Toilettage', HEALTH: 'Santé', OTHER: 'Autre',
};
const CATEGORY_LABEL_EN: Record<string, string> = {
  FOOD: 'Food', TOY: 'Toy', ACCESSORY: 'Accessory',
  GROOMING: 'Grooming', HEALTH: 'Health', OTHER: 'Other',
};

export default function ProductsClient({ locale, initialProducts, stockValue }: ProductsClientProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Stock adjust modal
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  // Filtres
  const [filterSupplier, setFilterSupplier] = useState<string>('');
  const [filterSpecies, setFilterSpecies] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [showArchived, setShowArchived] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [archiveBusy, setArchiveBusy] = useState<string | null>(null);

  const suppliersList = Array.from(new Set(products.map((p) => p.supplier).filter(Boolean))) as string[];
  const categoriesList = Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[];

  const filteredProducts = products.filter((p) => {
    if (Boolean(p.isArchived) !== showArchived) return false;
    if (filterSupplier && p.supplier !== filterSupplier) return false;
    if (filterSpecies && p.targetSpecies !== filterSpecies) return false;
    if (filterCategory && p.category !== filterCategory) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const match =
        p.name.toLowerCase().includes(q) ||
        (p.reference?.toLowerCase().includes(q) ?? false);
      if (!match) return false;
    }
    return true;
  });

  function isLowStock(p: Product): boolean {
    return (
      p.lowStockThreshold != null &&
      p.lowStockThreshold > 0 &&
      p.stock <= p.lowStockThreshold
    );
  }

  const totalValue = filteredProducts.reduce((s, p) => s + p.price * p.stock, 0);

  function openCreate() {
    setEditProduct(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowModal(true);
  }

  function openEdit(p: Product) {
    setEditProduct(p);
    setForm({
      name: p.name,
      brand: p.brand ?? '',
      reference: p.reference ?? '',
      category: p.category ?? '',
      description: p.description ?? '',
      price: String(p.price),
      costPrice: p.costPrice != null ? String(p.costPrice) : '',
      stock: String(p.stock),
      lowStockThreshold: p.lowStockThreshold != null ? String(p.lowStockThreshold) : '',
      available: p.available,
      targetSpecies: p.targetSpecies ?? 'BOTH',
      targetAge: p.targetAge ?? 'ALL',
      supplier: p.supplier ?? '',
      weight: p.weight ?? '',
      imageUrl: p.imageUrl ?? '',
    });
    setError(null);
    setShowModal(true);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    const price = parseFloat(form.price);
    const stock = parseInt(form.stock, 10);
    if (!form.name.trim() || isNaN(price) || price < 0 || isNaN(stock) || stock < 0) {
      setError(t('Nom, prix et stock sont obligatoires.', 'Name, price and stock are required.', locale));
      return;
    }
    setSubmitting(true);
    setError(null);
    const costPrice = form.costPrice.trim() ? parseFloat(form.costPrice) : null;
    const lowStockThreshold = form.lowStockThreshold.trim()
      ? parseInt(form.lowStockThreshold, 10)
      : null;
    const basePayload = {
      name: form.name.trim(),
      brand: form.brand.trim() || undefined,
      reference: form.reference.trim() || undefined,
      category: form.category.trim() || undefined,
      description: form.description.trim() || undefined,
      price,
      ...(costPrice !== null && !isNaN(costPrice) ? { costPrice } : {}),
      stock,
      ...(lowStockThreshold !== null && !isNaN(lowStockThreshold) ? { lowStockThreshold } : {}),
      available: form.available,
      targetSpecies: form.targetSpecies,
      targetAge: form.targetAge,
      supplier: form.supplier.trim() || undefined,
      weight: form.weight.trim() || undefined,
      imageUrl: form.imageUrl.trim() || undefined,
    };
    try {
      if (editProduct) {
        const res = await fetch(`/api/admin/products/${editProduct.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...basePayload, version: editProduct.version ?? 0 }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.error === 'VERSION_CONFLICT') {
            setError(t(
              'Ce produit a été modifié entre-temps. Recharge la page pour voir la dernière version.',
              'This product was modified meanwhile. Reload the page to see the latest version.',
              locale,
            ));
            return;
          }
          throw new Error(data.error ?? 'ERROR');
        }
        const updated: Product = await res.json();
        setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        const res = await fetch('/api/admin/products', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(basePayload),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'ERROR');
        const created: Product = await res.json();
        setProducts((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setShowModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ERROR');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleAvailable(p: Product) {
    const optimistic = products.map((x) => x.id === p.id ? { ...x, available: !x.available } : x);
    setProducts(optimistic);
    const res = await fetch(`/api/admin/products/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ available: !p.available, version: p.version ?? 0 }),
    });
    if (!res.ok) {
      // revert
      setProducts(products);
    } else {
      const updated: Product = await res.json();
      setProducts((prev) => prev.map((x) => x.id === updated.id ? updated : x));
    }
  }

  async function archiveProduct(p: Product) {
    setArchiveBusy(p.id);
    const res = await fetch(`/api/admin/products/${p.id}/archive`, { method: 'POST' });
    if (res.ok) {
      const updated: Product = await res.json();
      setProducts((prev) => prev.map((x) => x.id === updated.id ? updated : x));
    }
    setArchiveBusy(null);
  }

  async function restoreProduct(p: Product) {
    setArchiveBusy(p.id);
    const res = await fetch(`/api/admin/products/${p.id}/restore`, { method: 'POST' });
    if (res.ok) {
      const updated: Product = await res.json();
      setProducts((prev) => prev.map((x) => x.id === updated.id ? updated : x));
    }
    setArchiveBusy(null);
  }

  async function applyAdjust() {
    if (!adjustTarget) return;
    const delta = parseInt(adjustDelta, 10);
    if (isNaN(delta)) return;
    const newStock = Math.max(0, adjustTarget.stock + delta);
    setAdjusting(true);
    const res = await fetch(`/api/admin/products/${adjustTarget.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stock: newStock, version: adjustTarget.version ?? 0 }),
    });
    if (res.ok) {
      const updated: Product = await res.json();
      setProducts((prev) => prev.map((p) => p.id === updated.id ? updated : p));
      setAdjustTarget(null);
      setAdjustDelta('');
    }
    setAdjusting(false);
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-6 w-6 text-gold-600" />
            <h1 className="text-2xl font-bold text-charcoal">
              {t('Produits & Stock', 'Products & Stock', locale)}
            </h1>
          </div>
          <p className="text-sm text-gray-500">
            {filteredProducts.length}/{products.length} {t('produit(s)', 'product(s)', locale)}
            {' · '}
            {t('Valeur stock', 'Stock value', locale)} : <span className="font-semibold text-charcoal">{formatMAD(totalValue)}</span>
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-charcoal text-white rounded-lg text-sm font-medium hover:bg-charcoal/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t('Ajouter un produit', 'Add product', locale)}
        </button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
        <select value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)}
          className="border border-ivory-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">{t('Tous fournisseurs', 'All suppliers', locale)}</option>
          {suppliersList.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterSpecies} onChange={(e) => setFilterSpecies(e.target.value)}
          className="border border-ivory-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">{t('Toutes espèces', 'All species', locale)}</option>
          <option value="DOG">🐕 {t('Chien', 'Dog', locale)}</option>
          <option value="CAT">🐈 {t('Chat', 'Cat', locale)}</option>
          <option value="BOTH">{t('Les deux', 'Both', locale)}</option>
        </select>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
          className="border border-ivory-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">{t('Toutes catégories', 'All categories', locale)}</option>
          {categoriesList.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(filterSupplier || filterSpecies || filterCategory) && (
          <button onClick={() => { setFilterSupplier(''); setFilterSpecies(''); setFilterCategory(''); }}
            className="text-xs text-gray-400 hover:text-charcoal underline">
            {t('Réinitialiser', 'Reset', locale)}
          </button>
        )}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('Rechercher (nom, réf.)', 'Search (name, ref.)', locale)}
          className="border border-ivory-200 rounded-lg px-2 py-1.5 bg-white flex-1 min-w-[180px]"
        />
        <label className="inline-flex items-center gap-2 ml-auto cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded"
          />
          <span className="text-xs text-gray-600">{t('Voir archivés', 'Show archived', locale)}</span>
        </label>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#FAF6F0] border-b border-[#F0D98A]/40">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-charcoal">{t('Nom', 'Name', locale)}</th>
                <th className="px-4 py-3 text-left font-semibold text-charcoal">{t('Fournisseur', 'Supplier', locale)}</th>
                <th className="px-4 py-3 text-left font-semibold text-charcoal">{t('Catégorie', 'Category', locale)}</th>
                <th className="px-4 py-3 text-center font-semibold text-charcoal">{t('Espèce', 'Species', locale)}</th>
                <th className="px-4 py-3 text-center font-semibold text-charcoal">{t('Âge', 'Age', locale)}</th>
                <th className="px-4 py-3 text-right font-semibold text-charcoal">{t('Prix', 'Price', locale)}</th>
                <th className="px-4 py-3 text-center font-semibold text-charcoal">{t('Stock', 'Stock', locale)}</th>
                <th className="px-4 py-3 text-center font-semibold text-charcoal">{t('Dispo', 'Available', locale)}</th>
                <th className="px-4 py-3 text-right font-semibold text-charcoal">{t('Actions', 'Actions', locale)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ivory-100">
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">
                    {t('Aucun produit. Cliquez sur "+ Ajouter" pour commencer.', 'No products. Click "+ Add product" to get started.', locale)}
                  </td>
                </tr>
              )}
              {filteredProducts.map((p) => (
                <tr key={p.id} className={`transition-colors ${isLowStock(p) ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-[#FAF6F0]/50'}`}>
                  <td className="px-4 py-3 font-medium text-charcoal">
                    {p.name}{p.weight && <span className="text-xs text-gray-400 ml-1">· {p.weight}</span>}
                    {isLowStock(p) && (
                      <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">
                        <AlertTriangle className="h-3 w-3" /> {t('seuil', 'low', locale)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.supplier ?? p.brand ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{p.category ?? '—'}</td>
                  <td className="px-4 py-3 text-center text-gray-500 text-xs">{SPECIES_LABEL[p.targetSpecies ?? 'BOTH']}</td>
                  <td className="px-4 py-3 text-center text-gray-500 text-xs">{AGE_LABEL[p.targetAge ?? 'ALL']}</td>
                  <td className="px-4 py-3 text-right font-medium text-charcoal">{formatMAD(p.price)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <StockBadge stock={p.stock} />
                      <button
                        onClick={() => { setAdjustTarget(p); setAdjustDelta(''); }}
                        className="text-gray-400 hover:text-gold-600 transition-colors"
                        title={t('Ajuster stock', 'Adjust stock', locale)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleAvailable(p)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${p.available ? 'bg-green-500' : 'bg-gray-300'}`}
                      title={p.available ? t('Désactiver', 'Disable', locale) : t('Activer', 'Enable', locale)}
                    >
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${p.available ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(p)}
                        className="px-2 py-1 rounded-md text-xs font-medium text-gray-500 hover:text-gold-600 hover:bg-gold-50 transition-colors"
                        title={t('Modifier', 'Edit', locale)}
                      >
                        {t('Modifier', 'Edit', locale)}
                      </button>
                      {p.isArchived ? (
                        <button
                          onClick={() => restoreProduct(p)}
                          disabled={archiveBusy === p.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                          title={t('Restaurer', 'Restore', locale)}
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                          {t('Restaurer', 'Restore', locale)}
                        </button>
                      ) : (
                        <button
                          onClick={() => archiveProduct(p)}
                          disabled={archiveBusy === p.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-gray-500 hover:text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-colors"
                          title={t('Archiver', 'Archive', locale)}
                        >
                          <Archive className="h-3.5 w-3.5" />
                          {t('Archiver', 'Archive', locale)}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-ivory-100">
              <h2 className="font-semibold text-charcoal">
                {editProduct ? t('Modifier le produit', 'Edit product', locale) : t('Nouveau produit', 'New product', locale)}
              </h2>
            </div>
            <form onSubmit={submitForm} className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('Nom *', 'Name *', locale)}</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('Marque', 'Brand', locale)}</label>
                  <input
                    value={form.brand}
                    onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                    className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('Référence', 'Reference', locale)}</label>
                  <input
                    value={form.reference}
                    onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                    className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-gold-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('Catégorie', 'Category', locale)}</label>
                <input
                  list="product-category-suggestions"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder={t('ex: Alimentation, Accessoires, Hygiène…', 'e.g. Food, Accessories, Hygiene…', locale)}
                  className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
                />
                <datalist id="product-category-suggestions">
                  {PRODUCT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {locale === 'en' ? CATEGORY_LABEL_EN[c] : CATEGORY_LABEL_FR[c]}
                    </option>
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('Description', 'Description', locale)}</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  maxLength={500}
                  className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('Prix de vente (MAD) *', 'Sale price (MAD) *', locale)}</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t("Prix d'achat (MAD)", 'Cost price (MAD)', locale)}</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.costPrice}
                    onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                    className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
                  />
                </div>
              </div>
              {(() => {
                const sale = parseFloat(form.price);
                const cost = parseFloat(form.costPrice);
                if (!isNaN(sale) && !isNaN(cost) && cost > 0 && sale > 0) {
                  const margin = ((sale - cost) / sale) * 100;
                  return (
                    <div className="text-xs text-emerald-700 bg-emerald-50/60 rounded-md px-3 py-1.5">
                      {t('Marge', 'Margin', locale)} :{' '}
                      <span className="font-semibold">{margin.toFixed(1)}%</span>
                      {' · '}
                      {formatMAD(sale - cost)}
                    </div>
                  );
                }
                return null;
              })()}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('Stock *', 'Stock *', locale)}</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={form.stock}
                    onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                    className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t("Seuil d'alerte", 'Low-stock threshold', locale)}</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={form.lowStockThreshold}
                    onChange={(e) => setForm((f) => ({ ...f, lowStockThreshold: e.target.value }))}
                    placeholder={t('vide = pas d\'alerte', 'empty = no alert', locale)}
                    className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('Espèce cible', 'Target species', locale)}</label>
                  <select value={form.targetSpecies} onChange={(e) => setForm((f) => ({ ...f, targetSpecies: e.target.value }))}
                    className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400">
                    <option value="BOTH">{t('Chien & Chat', 'Dog & Cat', locale)}</option>
                    <option value="DOG">🐕 {t('Chien', 'Dog', locale)}</option>
                    <option value="CAT">🐈 {t('Chat', 'Cat', locale)}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('Âge cible', 'Target age', locale)}</label>
                  <select value={form.targetAge} onChange={(e) => setForm((f) => ({ ...f, targetAge: e.target.value }))}
                    className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400">
                    <option value="ALL">{t('Tout âge', 'All ages', locale)}</option>
                    <option value="PUPPY">{t('Chiot/Chaton (<12 mois)', 'Puppy/Kitten (<12 mo)', locale)}</option>
                    <option value="JUNIOR">{t('Jeune (12-24 mois)', 'Junior (12-24 mo)', locale)}</option>
                    <option value="ADULT">{t('Adulte (2-7 ans)', 'Adult (2-7 yr)', locale)}</option>
                    <option value="SENIOR">{t('Senior (7+ ans)', 'Senior (7+ yr)', locale)}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('Fournisseur', 'Supplier', locale)}</label>
                  <input value={form.supplier} onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
                    placeholder="Ultra Premium, Canvit…"
                    className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('Conditionnement', 'Packaging', locale)}</label>
                  <input value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                    placeholder="12kg, 500ml…"
                    className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('URL image (optionnel)', 'Image URL (optional)', locale)}</label>
                <input type="url" value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  placeholder="https://…"
                  className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400" />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="available-toggle"
                  type="checkbox"
                  checked={form.available}
                  onChange={(e) => setForm((f) => ({ ...f, available: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-gold-500"
                />
                <label htmlFor="available-toggle" className="text-sm text-charcoal">
                  {t('Disponible à la commande', 'Available for ordering', locale)}
                </label>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  {t('Annuler', 'Cancel', locale)}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-charcoal text-white text-sm font-medium disabled:opacity-50 hover:bg-charcoal/90 transition-colors"
                >
                  {submitting ? '…' : editProduct ? t('Enregistrer', 'Save', locale) : t('Créer', 'Create', locale)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock adjust modal */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-6 space-y-4">
            <h2 className="font-semibold text-charcoal">
              {t('Ajuster le stock', 'Adjust stock', locale)} — <span className="text-gold-600">{adjustTarget.name}</span>
            </h2>
            <p className="text-sm text-gray-500">
              {t('Stock actuel', 'Current stock', locale)} : <span className="font-semibold text-charcoal">{adjustTarget.stock}</span>
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {t('Delta (+/−)', 'Delta (+/−)', locale)}
              </label>
              <input
                type="number"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                placeholder="+10 ou -5"
                className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400"
              />
              {adjustDelta !== '' && !isNaN(parseInt(adjustDelta, 10)) && (
                <p className="text-xs text-gray-400 mt-1">
                  → {t('Nouveau stock', 'New stock', locale)} : {Math.max(0, adjustTarget.stock + parseInt(adjustDelta, 10))}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setAdjustTarget(null)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                {t('Annuler', 'Cancel', locale)}
              </button>
              <button
                onClick={applyAdjust}
                disabled={adjusting || adjustDelta === '' || isNaN(parseInt(adjustDelta, 10))}
                className="px-3 py-1.5 text-sm bg-charcoal text-white rounded-lg disabled:opacity-50"
              >
                {adjusting ? '…' : t('Confirmer', 'Confirm', locale)}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
