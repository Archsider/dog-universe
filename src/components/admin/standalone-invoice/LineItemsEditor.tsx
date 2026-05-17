'use client';

import { Plus, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ProductCatalogSearchSelect from '@/components/admin/ProductCatalogSearchSelect';
import { CATEGORY_OPTIONS, QUICK_ADD_PRESETS, type LineItem, type CatalogProduct, type QuickAddPreset } from './types';

interface LineItemsEditorProps {
  items: LineItem[];
  catalog: CatalogProduct[];
  locale: string;
  onAddItem: () => void;
  onRemoveItem: (i: number) => void;
  onUpdateItem: (i: number, field: keyof LineItem, value: string | number | undefined) => void;
  /**
   * Optional multi-field patch — used by ProductCatalogSearchSelect to update
   * (description + unitPrice + productId + category) in one shot. Falls back
   * to sequential onUpdateItem if not provided (legacy callers).
   */
  onPatchItem?: (i: number, patch: Partial<LineItem>) => void;
  onAddPreset: (preset: QuickAddPreset) => void;
}

export function LineItemsEditor({
  items,
  catalog,
  locale,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
  onPatchItem,
  onAddPreset,
}: LineItemsEditorProps) {
  const fr = locale === 'fr';

  function patchItem(i: number, patch: Partial<LineItem>) {
    if (onPatchItem) {
      onPatchItem(i, patch);
      return;
    }
    // Fallback : sequential updates. Last-write-wins on the underlying state
    // reducer — works because the parent's onUpdateItem uses functional setState.
    for (const k of Object.keys(patch) as (keyof LineItem)[]) {
      onUpdateItem(i, k, patch[k] as string | number | undefined);
    }
  }

  const productLabel = (p: CatalogProduct) =>
    p.brand ? `${p.name} — ${p.brand}` : p.name;

  const total = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);

  return (
    <>
      {/* Quick-add presets */}
      <div>
        <Label className="text-xs text-gray-500">{fr ? 'Ajout rapide' : 'Quick add'}</Label>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {QUICK_ADD_PRESETS.map(preset => (
            <button
              key={preset.labelFr}
              type="button"
              onClick={() => onAddPreset(preset)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${preset.color}`}
            >
              + {fr ? preset.labelFr : preset.labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* Line items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">{fr ? 'Articles *' : 'Items *'}</Label>
          <Button size="sm" variant="outline" onClick={onAddItem} className="h-7 text-xs gap-1">
            <Plus className="h-3 w-3" />{fr ? 'Ligne vide' : 'Empty line'}
          </Button>
        </div>

        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 px-1">
            <span className="col-span-4">{fr ? 'Description' : 'Description'}</span>
            <span className="col-span-3">{fr ? 'Catégorie' : 'Category'}</span>
            <span className="col-span-1 text-center">{fr ? 'Qté' : 'Qty'}</span>
            <span className="col-span-3 text-right">{fr ? 'Prix unit.' : 'Unit price'}</span>
            <span className="col-span-1" />
          </div>

          {items.map((it, i) => {
            const isProduct = it.category === 'PRODUCT';
            const productMissing = isProduct && !it.productId;
            return (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              {isProduct ? (
                <div className="col-span-4">
                  <ProductCatalogSearchSelect
                    locale={fr ? 'fr' : 'en'}
                    value={{ productId: it.productId ?? null, description: it.description, price: it.unitPrice }}
                    serverError={productMissing
                      ? (fr ? 'Produit non lié' : 'Not catalog-linked')
                      : null}
                    onChange={(sel) => patchItem(i, {
                      productId: sel.productId,
                      description: sel.description,
                      unitPrice: sel.price,
                      category: 'PRODUCT',
                    })}
                  />
                </div>
              ) : (
                <Input
                  className="col-span-4 text-sm h-8"
                  list="invoice-products-datalist"
                  value={it.description}
                  onChange={e => onUpdateItem(i, 'description', e.target.value)}
                  placeholder={fr ? 'Tape ou choisis un produit du catalogue…' : 'Type or pick from catalogue…'}
                />
              )}
              <select
                value={it.category}
                onChange={e => {
                  const next = e.target.value as LineItem['category'];
                  // Switching INTO PRODUCT : reset description+price+productId so
                  // the smart-search input renders blank and the user must pick
                  // explicitly. Switching OUT : drop the productId so legacy
                  // free-text path resumes.
                  if (isProduct && next !== 'PRODUCT') {
                    patchItem(i, { category: next, productId: undefined });
                  } else if (!isProduct && next === 'PRODUCT') {
                    // eslint-disable-next-line dog-universe/no-hardcoded-product-without-id -- OK: UI state reset (category switch), not an InvoiceItem create. ProductCatalogSearchSelect will bind productId before submit; pre-submit guard in CreateStandaloneInvoiceModal.handleSubmit also blocks PRODUCT without productId.
                    patchItem(i, { category: 'PRODUCT', productId: undefined, description: '', unitPrice: 0 });
                  } else {
                    onUpdateItem(i, 'category', next);
                  }
                }}
                className={`col-span-3 text-sm h-8 px-2 rounded-lg border border-[#C4974A] bg-white focus:outline-none focus:ring-2 focus:ring-[#C4974A]/20 min-w-0 ${it.category === 'OTHER' ? 'border-l-4 border-l-amber-400' : ''}`}
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <Input
                type="number"
                min={1}
                className="col-span-1 text-sm h-8 text-center"
                value={it.quantity}
                onChange={e => onUpdateItem(i, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
              />
              <Input
                type="number"
                min={0}
                step={0.01}
                className="col-span-3 text-sm h-8 text-right"
                value={it.unitPrice}
                disabled={isProduct && !it.productId}
                onChange={e => onUpdateItem(i, 'unitPrice', parseFloat(e.target.value) || 0)}
              />
              <button
                onClick={() => onRemoveItem(i)}
                disabled={items.length === 1}
                className="col-span-1 flex items-center justify-center text-gray-400 hover:text-red-500 disabled:opacity-20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            );
          })}
        </div>
        {items.some((it) => it.category === 'PRODUCT' && !it.productId) && (
          <p className="text-xs text-amber-700 flex items-center gap-1 mt-1">
            <AlertCircle className="h-3 w-3" />
            {fr
              ? 'Une ligne « Produit » doit être liée au catalogue avant envoi.'
              : 'A "Product" line must be linked to the catalog before submit.'}
          </p>
        )}

        {/* Catalogue produits — alimente l'autocomplete des descriptions */}
        <datalist id="invoice-products-datalist">
          {catalog.map(p => (
            <option key={p.id} value={productLabel(p)}>
              {p.price.toLocaleString()} MAD · stock {p.stock}
            </option>
          ))}
        </datalist>

        <div className="flex justify-end mt-3 pt-2 border-t border-gray-100">
          <span className="text-sm font-bold text-charcoal">
            Total : {total.toLocaleString()} MAD
          </span>
        </div>
      </div>
    </>
  );
}
