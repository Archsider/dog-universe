'use client';

// Step 2 — Multi-line items (description / qty / unit) with live total.
// DISCOUNT lines auto-normalise the sign of `unitPrice` (negative).
// PRODUCT category renders <ProductCatalogSearchSelect> instead of a free
// text input, so the row always carries a productId by submission time
// (server enforces PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID).

import { Plus, Trash2, AlertCircle } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import ProductCatalogSearchSelect from '@/components/admin/ProductCatalogSearchSelect';
import { CATEGORY_LABELS, type ItemCategory, type WalkinItem } from './types';

interface Props {
  fr: boolean;
  items: WalkinItem[];
  total: number;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<WalkinItem>) => void;
}

export default function WalkinItemsStep({
  fr, items, total, onAdd, onRemove, onUpdate,
}: Props) {
  return (
    <div className="space-y-3">
      {items.map((it) => {
        const isDiscount = it.category === 'DISCOUNT';
        const isProduct = it.category === 'PRODUCT';
        const productMissing = isProduct && !it.productId;
        const lineTotal = Math.round(it.quantity * it.unitPrice * 100) / 100;
        return (
          <div
            key={it.id}
            className={`p-3 rounded-lg border ${
              isDiscount
                ? 'border-red-200 bg-red-50/30'
                : productMissing
                ? 'border-amber-200 bg-amber-50/30'
                : 'border-[#F0D98A]/40 bg-white'
            }`}
          >
            <div className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-12 md:col-span-3">
                <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">
                  {fr ? 'Catégorie' : 'Category'}
                </label>
                <select
                  value={it.category}
                  onChange={(e) => {
                    const next = e.target.value as ItemCategory;
                    // Normalise sign for DISCOUNT.
                    let unit = it.unitPrice;
                    if (next === 'DISCOUNT' && unit >= 0) unit = -Math.abs(unit) || -1;
                    if (next !== 'DISCOUNT' && unit < 0) unit = Math.abs(unit);
                    // Switching INTO PRODUCT : clear description so the user
                    // immediately sees the empty smart-search input. Switching
                    // OUT of PRODUCT : drop the productId so the row reverts
                    // to free-text.
                    const patch: Partial<WalkinItem> = { category: next, unitPrice: unit };
                    if (it.category === 'PRODUCT' && next !== 'PRODUCT') {
                      patch.productId = null;
                    }
                    if (it.category !== 'PRODUCT' && next === 'PRODUCT') {
                      patch.productId = null;
                      patch.description = '';
                      patch.unitPrice = 0;
                    }
                    onUpdate(it.id, patch);
                  }}
                  className="w-full px-2 py-1.5 rounded-md border border-[#E2C048]/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
                >
                  {(Object.keys(CATEGORY_LABELS) as ItemCategory[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {fr ? CATEGORY_LABELS[cat].fr : CATEGORY_LABELS[cat].en}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 md:col-span-5">
                <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">
                  {fr ? 'Description' : 'Description'}
                  {isProduct && <span className="ml-1 text-emerald-600">· {fr ? 'lié au catalogue' : 'catalog-linked'}</span>}
                </label>
                {isProduct ? (
                  <ProductCatalogSearchSelect
                    locale={fr ? 'fr' : 'en'}
                    value={{ productId: it.productId ?? null, description: it.description, price: it.unitPrice }}
                    serverError={productMissing
                      ? (fr ? 'Sélectionne un produit du catalogue ou crée-le.' : 'Pick a catalog product or create it.')
                      : null}
                    onChange={(sel) => onUpdate(it.id, {
                      productId: sel.productId,
                      description: sel.description,
                      unitPrice: sel.price,
                      category: 'PRODUCT',
                    })}
                  />
                ) : (
                  <input
                    type="text"
                    value={it.description}
                    onChange={(e) => onUpdate(it.id, { description: e.target.value })}
                    placeholder={fr ? 'Ex : Toilettage long' : 'E.g. Long grooming'}
                    className="w-full px-2 py-1.5 rounded-md border border-[#E2C048]/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
                    maxLength={200}
                  />
                )}
              </div>
              <div className="col-span-4 md:col-span-1">
                <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">
                  {fr ? 'Qté' : 'Qty'}
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={it.quantity}
                  onChange={(e) => onUpdate(it.id, { quantity: Math.max(1, parseInt(e.target.value || '1', 10) || 1) })}
                  className="w-full px-2 py-1.5 rounded-md border border-[#E2C048]/40 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
                />
              </div>
              <div className="col-span-5 md:col-span-2">
                <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">
                  {fr ? 'Prix unit.' : 'Unit'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={it.unitPrice}
                  onChange={(e) => onUpdate(it.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                  disabled={isProduct && !it.productId}
                  className={`w-full px-2 py-1.5 rounded-md border text-sm tabular-nums focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:cursor-not-allowed ${
                    isDiscount ? 'border-red-300 text-red-700 focus:ring-red-300' : 'border-[#E2C048]/40 focus:ring-[#C4974A]/40'
                  }`}
                />
              </div>
              <div className="col-span-3 md:col-span-1 flex items-end justify-end gap-1">
                <button
                  type="button"
                  onClick={() => onRemove(it.id)}
                  disabled={items.length === 1}
                  className="p-1.5 rounded-md text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={fr ? 'Supprimer' : 'Delete'}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-2 text-right text-xs text-gray-500 tabular-nums">
              {fr ? 'Sous-total' : 'Subtotal'} :{' '}
              <span className={`font-semibold ${isDiscount ? 'text-red-600' : 'text-charcoal'}`}>
                {formatMAD(lineTotal)}
              </span>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={onAdd}
        className="w-full inline-flex items-center justify-center gap-1 py-2 rounded-lg border-2 border-dashed border-[#E2C048]/40 text-sm text-[#C4974A] hover:bg-[#FBF5E0]/40 font-medium"
      >
        <Plus className="h-4 w-4" />
        {fr ? 'Ajouter une ligne' : 'Add a line'}
      </button>

      <div className="flex items-baseline justify-between pt-3 border-t border-[#F0D98A]/30">
        <span className="text-sm font-medium text-charcoal">
          {fr ? 'Total facture' : 'Invoice total'}
        </span>
        <span className={`text-xl font-bold tabular-nums ${total <= 0 ? 'text-red-600' : 'text-emerald-700'}`}>
          {formatMAD(total)}
        </span>
      </div>
      {total <= 0 && (
        <p className="text-xs text-red-600 text-right">
          {fr ? 'Le total doit être strictement positif.' : 'Total must be strictly positive.'}
        </p>
      )}
      {items.some((it) => it.category === 'PRODUCT' && !it.productId) && (
        <p className="text-xs text-amber-700 flex items-center gap-1 justify-end">
          <AlertCircle className="h-3 w-3" />
          {fr
            ? 'Une ligne « Produit » n\'est pas liée au catalogue.'
            : 'A "Product" line is missing a catalog link.'}
        </p>
      )}
    </div>
  );
}
