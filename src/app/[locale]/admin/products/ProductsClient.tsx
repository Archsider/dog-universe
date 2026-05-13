'use client';

// Slim orchestrator — see _components/ for the section sub-components.
// State + API calls live here so handleSubmit() and the optimistic
// mutations can read/write a single source of truth; the section
// components are pure presentational slices.
//
// File went from 702 LOC to ~280 by extracting the form modal (180+ L
// of dense field definitions) and the stock-adjust modal into focused
// files.

import { useMemo, useState } from 'react';
import { Package, Plus } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import {
  EMPTY_FORM,
  type Product,
  type ProductForm,
  t,
} from './_components/types';
import { ProductsFilters } from './_components/ProductsFilters';
import { ProductsTable } from './_components/ProductsTable';
import { ProductFormModal } from './_components/ProductFormModal';
import { StockAdjustModal } from './_components/StockAdjustModal';

interface ProductsClientProps {
  locale: string;
  initialProducts: Product[];
  stockValue: number;
}

export default function ProductsClient({ locale, initialProducts }: ProductsClientProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts);

  // ── Form modal ────────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Stock adjust modal ────────────────────────────────────────────────
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  // ── Filters ───────────────────────────────────────────────────────────
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterSpecies, setFilterSpecies] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [archiveBusy, setArchiveBusy] = useState<string | null>(null);

  const suppliers = useMemo(
    () => Array.from(new Set(products.map((p) => p.supplier).filter(Boolean))) as string[],
    [products],
  );
  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[],
    [products],
  );

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
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
  }, [products, showArchived, filterSupplier, filterSpecies, filterCategory, search]);

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
      setError(
        t('Nom, prix et stock sont obligatoires.', 'Name, price and stock are required.', locale),
      );
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
            setError(
              t(
                'Ce produit a été modifié entre-temps. Recharge la page pour voir la dernière version.',
                'This product was modified meanwhile. Reload the page to see the latest version.',
                locale,
              ),
            );
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

  // Optimistic toggle — revert on server failure. We snapshot the previous
  // products state so the revert is cheap (O(1) reset) instead of a copy.
  async function toggleAvailable(p: Product) {
    const snapshot = products;
    setProducts((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, available: !x.available } : x)),
    );
    const res = await fetch(`/api/admin/products/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ available: !p.available, version: p.version ?? 0 }),
    });
    if (!res.ok) {
      setProducts(snapshot);
    } else {
      const updated: Product = await res.json();
      setProducts((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    }
  }

  async function archiveProduct(p: Product) {
    setArchiveBusy(p.id);
    const res = await fetch(`/api/admin/products/${p.id}/archive`, { method: 'POST' });
    if (res.ok) {
      const updated: Product = await res.json();
      setProducts((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    }
    setArchiveBusy(null);
  }

  async function restoreProduct(p: Product) {
    setArchiveBusy(p.id);
    const res = await fetch(`/api/admin/products/${p.id}/restore`, { method: 'POST' });
    if (res.ok) {
      const updated: Product = await res.json();
      setProducts((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
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
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setAdjustTarget(null);
      setAdjustDelta('');
    }
    setAdjusting(false);
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-6 w-6 text-gold-600" />
            <h1 className="text-2xl font-bold text-charcoal">
              {t('Produits & Stock', 'Products & Stock', locale)}
            </h1>
          </div>
          <p className="text-sm text-gray-500">
            {filteredProducts.length}/{products.length}{' '}
            {t('produit(s)', 'product(s)', locale)}
            {' · '}
            {t('Valeur stock', 'Stock value', locale)} :{' '}
            <span className="font-semibold text-charcoal">{formatMAD(totalValue)}</span>
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

      <ProductsFilters
        locale={locale}
        suppliers={suppliers}
        categories={categories}
        filterSupplier={filterSupplier}
        setFilterSupplier={setFilterSupplier}
        filterSpecies={filterSpecies}
        setFilterSpecies={setFilterSpecies}
        filterCategory={filterCategory}
        setFilterCategory={setFilterCategory}
        search={search}
        setSearch={setSearch}
        showArchived={showArchived}
        setShowArchived={setShowArchived}
      />

      <ProductsTable
        locale={locale}
        products={filteredProducts}
        archiveBusy={archiveBusy}
        onEdit={openEdit}
        onAdjustStock={(p) => {
          setAdjustTarget(p);
          setAdjustDelta('');
        }}
        onToggleAvailable={toggleAvailable}
        onArchive={archiveProduct}
        onRestore={restoreProduct}
      />

      <ProductFormModal
        locale={locale}
        open={showModal}
        editProduct={editProduct}
        form={form}
        setForm={setForm}
        submitting={submitting}
        error={error}
        onSubmit={submitForm}
        onClose={() => setShowModal(false)}
      />

      <StockAdjustModal
        locale={locale}
        target={adjustTarget}
        delta={adjustDelta}
        setDelta={setAdjustDelta}
        busy={adjusting}
        onConfirm={applyAdjust}
        onClose={() => setAdjustTarget(null)}
      />
    </div>
  );
}
