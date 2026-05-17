'use client';

/**
 * ProductCatalogSearchSelect
 * -------------------------------------------------------------------
 * Smart product search + quick-create for InvoiceItem rows with
 * category='PRODUCT'. Mehdi types → debounced search hits
 * GET /api/admin/products?search=. He picks one → onChange with the
 * full product. If nothing matches, the "+ Add to catalog" button opens
 * a tiny modal to create a new product on the fly.
 *
 * Mobile-first : full-width input, large tap targets on result rows,
 * dropdown is rendered as a sibling (no overlap with parent overflow).
 *
 * Contract with the server (Agent 1's Zod rule
 * PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID): every `category='PRODUCT'` item
 * MUST carry a non-null `productId`. The onChange callback always emits
 * { productId, description, price, category: 'PRODUCT' }, which is the
 * caller's contract — never call onChange without a productId.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, X, AlertCircle, Loader2, Check } from 'lucide-react';
import { formatMAD } from '@/lib/utils';

interface CatalogProductRow {
  id: string;
  name: string;
  brand: string | null;
  price: number;
  stock: number;
  available?: boolean;
  isArchived?: boolean;
  category?: string | null;
}

interface SelectedProduct {
  productId: string | null;
  description: string;
  price: number;
}

export interface ProductCatalogSearchSelectProps {
  value: SelectedProduct | null;
  onChange: (selection: { productId: string; description: string; price: number; category: 'PRODUCT' }) => void;
  /** Optional override — by default we POST /api/admin/products. */
  onCreateFromText?: (text: string) => Promise<{ productId: string; description: string; price: number }>;
  locale: 'fr' | 'en';
  /** Inline error to surface (e.g. server rejected because productId missing). */
  serverError?: string | null;
  /** Disable the whole thing — useful when the row is read-only. */
  disabled?: boolean;
}

function productLabel(p: CatalogProductRow): string {
  return p.brand ? `${p.name} — ${p.brand}` : p.name;
}

function highlight(text: string, query: string) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="bg-amber-100 font-semibold text-amber-900">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function ProductCatalogSearchSelect({
  value,
  onChange,
  onCreateFromText,
  locale,
  serverError,
  disabled,
}: ProductCatalogSearchSelectProps) {
  const fr = locale === 'fr';
  // The input shows the selected product's label until the user types — then
  // we treat it as a fresh search query.
  const [query, setQuery] = useState(value?.description ?? '');
  const [results, setResults] = useState<CatalogProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Keep input in sync if parent value changes externally (e.g. row reset).
  // We deliberately key only on `productId` — the description should follow
  // the productId change, not the other way around (typing in the search
  // input is local until the user picks a row).
  useEffect(() => {
    setQuery(value?.description ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- description follows productId by design
  }, [value?.productId]);

  // Click outside → close dropdown.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Debounced search (300ms). Empty query clears results.
  useEffect(() => {
    const trimmed = query.trim();
    // If the input still matches the locked-in selection, skip — avoid an
    // unnecessary fetch on first render.
    if (trimmed.length === 0) { setResults([]); setFetchError(null); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setFetchError(null);
      try {
        const r = await fetch(`/api/admin/products?search=${encodeURIComponent(trimmed)}`, {
          signal: ctrl.signal,
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data: CatalogProductRow[] = await r.json();
        // Only keep available + non-archived products.
        setResults(data.filter((p) => p.available !== false && !p.isArchived).slice(0, 10));
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setFetchError(fr ? 'Recherche indisponible. Réessaie.' : 'Search unavailable. Try again.');
        }
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, fr]);

  const isSelected = value?.productId != null;
  const showCreateButton = useMemo(() => {
    const t = query.trim();
    if (t.length < 3) return false;
    if (loading) return false;
    // Hide if a result EXACTLY matches what the user typed.
    return !results.some((r) => productLabel(r).toLowerCase() === t.toLowerCase());
  }, [query, results, loading]);

  function pick(p: CatalogProductRow) {
    onChange({ productId: p.id, description: productLabel(p), price: p.price, category: 'PRODUCT' });
    setQuery(productLabel(p));
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      {/* Input row */}
      <div className={`flex items-center gap-1.5 rounded-md border ${
        serverError ? 'border-red-300 bg-red-50/40' : isSelected ? 'border-emerald-400 bg-emerald-50/30' : 'border-[#E2C048]/40 bg-white'
      } focus-within:ring-2 focus-within:ring-[#C4974A]/40`}>
        <Search className="h-4 w-4 text-gray-400 ml-2 flex-shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          placeholder={fr ? 'Tape le nom du produit…' : 'Type the product name…'}
          className="flex-1 min-w-0 px-1 py-1.5 text-sm bg-transparent focus:outline-none disabled:opacity-50"
          aria-label={fr ? 'Rechercher un produit' : 'Search a product'}
          inputMode="search"
          autoComplete="off"
        />
        {isSelected && !disabled && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              // We intentionally don't onChange(null) — the caller's TS contract
              // requires a complete payload. Clearing the productId is the caller's
              // job (e.g. switch the category back to OTHER).
              setOpen(true);
            }}
            className="p-1 mr-1 rounded text-gray-400 hover:text-red-500"
            aria-label={fr ? 'Effacer' : 'Clear'}
            title={fr ? 'Effacer' : 'Clear'}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {loading && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin text-gray-400" aria-hidden="true" />}
        {isSelected && !loading && !disabled && (
          <Check className="h-4 w-4 mr-2 text-emerald-600" aria-hidden="true" />
        )}
      </div>

      {serverError && (
        <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {serverError}
        </p>
      )}
      {fetchError && open && (
        <p className="mt-1 text-xs text-amber-700 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {fetchError}
        </p>
      )}

      {/* Dropdown */}
      {open && !disabled && (query.trim().length > 0) && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-[#F0D98A]/40 rounded-md shadow-lg overflow-hidden max-h-72 overflow-y-auto">
          {results.length === 0 && !loading && (
            <div className="px-3 py-2 text-sm text-gray-500">
              {fr ? 'Aucun produit trouvé.' : 'No product found.'}
            </div>
          )}
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p)}
              className="w-full text-left px-3 py-2.5 hover:bg-[#FBF5E0]/60 border-b border-[#F0D98A]/20 last:border-b-0 flex items-start justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm text-charcoal truncate">{highlight(productLabel(p), query)}</div>
                <div className="text-[11px] text-gray-500 flex gap-2 mt-0.5">
                  {p.category && <span>{p.category}</span>}
                  <span className={p.stock <= 0 ? 'text-red-500' : ''}>
                    {fr ? `stock ${p.stock}` : `stock ${p.stock}`}
                  </span>
                </div>
              </div>
              <span className="text-sm font-semibold text-charcoal tabular-nums whitespace-nowrap">
                {formatMAD(p.price)}
              </span>
            </button>
          ))}
          {showCreateButton && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="w-full text-left px-3 py-2.5 bg-emerald-50/60 hover:bg-emerald-100/60 border-t border-emerald-200 flex items-center gap-2"
            >
              <Plus className="h-4 w-4 text-emerald-700" />
              <span className="text-sm text-emerald-800">
                {fr ? 'Ajouter au catalogue : ' : 'Add to catalog: '}
                <span className="font-semibold">« {query.trim()} »</span>
              </span>
            </button>
          )}
        </div>
      )}

      {/* Quick-create modal (mounted lazily) */}
      {createOpen && (
        <QuickCreateModal
          locale={locale}
          initialName={query.trim()}
          initialPrice={value?.price && value.price > 0 ? value.price : 0}
          onClose={() => setCreateOpen(false)}
          onCreated={({ productId, description, price }) => {
            onChange({ productId, description, price, category: 'PRODUCT' });
            setQuery(description);
            setCreateOpen(false);
            setOpen(false);
          }}
          onCreateFromText={onCreateFromText}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------------
// Quick-create modal — minimal product creation form. Inline rather than
// shadcn Dialog to keep the bundle tight and avoid stacking inside other
// modals (works well as a nested overlay).
// -------------------------------------------------------------------

interface QuickCreateModalProps {
  locale: 'fr' | 'en';
  initialName: string;
  initialPrice: number;
  onClose: () => void;
  onCreated: (p: { productId: string; description: string; price: number }) => void;
  onCreateFromText?: (text: string) => Promise<{ productId: string; description: string; price: number }>;
}

function QuickCreateModal({ locale, initialName, initialPrice, onClose, onCreated, onCreateFromText }: QuickCreateModalProps) {
  const fr = locale === 'fr';
  const [name, setName] = useState(initialName);
  const [price, setPrice] = useState<number>(initialPrice);
  const [category, setCategory] = useState<string>('Croquettes');
  const [supplier, setSupplier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || name.trim().length < 2) { setError(fr ? 'Nom trop court.' : 'Name too short.'); return; }
    if (!Number.isFinite(price) || price < 0) { setError(fr ? 'Prix invalide.' : 'Invalid price.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      if (onCreateFromText) {
        const created = await onCreateFromText(name.trim());
        onCreated(created);
        return;
      }
      const r = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          price,
          stock: 0,
          category: category.trim() || undefined,
          supplier: supplier.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || 'CREATE_FAILED');
      }
      const product = await r.json();
      onCreated({
        productId: product.id,
        description: product.brand ? `${product.name} — ${product.brand}` : product.name,
        price: typeof product.price === 'number' ? product.price : Number(product.price),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CREATE_FAILED');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-charcoal">{fr ? 'Nouveau produit' : 'New product'}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {fr
                ? 'Ce produit sera ajouté au catalogue et lié à la ligne en cours.'
                : 'This product will be added to the catalog and linked to the current line.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-charcoal"
            aria-label={fr ? 'Fermer' : 'Close'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {fr ? 'Nom du produit *' : 'Product name *'}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
              maxLength={200}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {fr ? 'Prix (MAD) *' : 'Price (MAD) *'}
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-md border border-gray-200 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {fr ? 'Catégorie' : 'Category'}
              </label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
                maxLength={100}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {fr ? 'Fournisseur (optionnel)' : 'Supplier (optional)'}
            </label>
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
              maxLength={100}
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 text-xs text-red-600 flex items-start gap-1">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
            disabled={submitting}
          >
            {fr ? 'Annuler' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={submit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#C4974A] text-white text-sm font-medium hover:bg-[#a87f3a] disabled:opacity-50"
            disabled={submitting}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {fr ? 'Créer et lier' : 'Create & link'}
          </button>
        </div>
      </div>
    </div>
  );
}
