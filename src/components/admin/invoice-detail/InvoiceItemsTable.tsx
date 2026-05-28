'use client';

import { Plus, X, AlertCircle } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import ProductCatalogSearchSelect from '@/components/admin/ProductCatalogSearchSelect';
import { CATEGORY_OPTIONS, type EditItem, type InvoiceData, type ItemCategory } from './lib';

// ── View mode table ──────────────────────────────────────────────────────────

export function InvoiceItemsView({ invoice, isFr }: { invoice: InvoiceData; isFr: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        {isFr ? 'Lignes de facture' : 'Line items'}
      </p>
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ivory-100">
            <th className="text-left py-2 text-xs text-gray-400 font-medium">{isFr ? 'Description' : 'Description'}</th>
            <th className="text-center py-2 text-xs text-gray-400 font-medium w-14">{isFr ? 'Qté' : 'Qty'}</th>
            <th className="text-right py-2 text-xs text-gray-400 font-medium hidden sm:table-cell">{isFr ? 'Prix unit.' : 'Unit price'}</th>
            <th className="text-right py-2 text-xs text-gray-400 font-medium">{isFr ? 'Sous-total' : 'Subtotal'}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map(item => (
            <tr key={item.id} className="border-b border-ivory-50 last:border-0">
              <td className="py-2.5 text-charcoal">{item.description}</td>
              <td className="py-2.5 text-center text-gray-500">{item.quantity}</td>
              <td className="py-2.5 text-right text-gray-500 hidden sm:table-cell">
                {formatMAD(item.unitPrice)}
              </td>
              <td className="py-2.5 text-right font-semibold text-charcoal">
                {formatMAD(item.total)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[#F0D98A]">
            <td colSpan={3} className="pt-3 pb-1 text-base font-bold text-charcoal text-right hidden sm:table-cell pr-3">
              {isFr ? 'Total général' : 'Grand total'}
            </td>
            <td colSpan={2} className="pt-3 pb-1 text-base font-bold text-charcoal text-right sm:hidden">
              {isFr ? 'Total' : 'Total'}
            </td>
            <td className="pt-3 pb-1 text-right text-lg font-bold text-charcoal">
              {formatMAD(invoice.amount)}
            </td>
          </tr>
        </tfoot>
      </table>
      </div>
      <p className="mt-3 pt-3 border-t border-ivory-100 text-center text-xs text-gray-400 italic">
        Dog Universe Marrakech — {isFr ? 'Merci de votre confiance 🐾' : 'Thank you for your trust 🐾'}
      </p>
    </div>
  );
}

// ── Edit mode table ──────────────────────────────────────────────────────────

interface EditProps {
  editItems: EditItem[];
  editTotal: number;
  isFr: boolean;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onUpdate: (i: number, field: keyof EditItem, value: string | number) => void;
  /** Atomic multi-field update — used by the product catalog search. */
  onPatch: (i: number, patch: Partial<EditItem>) => void;
}

export function InvoiceItemsEdit({
  editItems, editTotal, isFr, onAdd, onRemove, onUpdate, onPatch,
}: EditProps) {
  const productMissing = editItems.some(it => it.category === 'PRODUCT' && !it.productId);
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          {isFr ? 'Lignes de facture' : 'Line items'}
        </p>
        <span className="text-[11px] text-gray-400">
          {editItems.length} {isFr ? (editItems.length > 1 ? 'lignes' : 'ligne') : (editItems.length > 1 ? 'lines' : 'line')}
        </span>
      </div>

      <div className="space-y-2.5">
        {editItems.map((it, i) => {
          const isProduct = it.category === 'PRODUCT';
          const lineSubtotal = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
          return (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-3 space-y-2.5 hover:border-gold-300/70 transition-colors">
            {/* Description / recherche produit — pleine largeur */}
            {isProduct ? (
              <ProductCatalogSearchSelect
                locale={isFr ? 'fr' : 'en'}
                value={{ productId: it.productId ?? null, description: it.description, price: it.unitPrice }}
                serverError={!it.productId ? (isFr ? 'Produit non lié' : 'Not catalog-linked') : null}
                onChange={sel => onPatch(i, {
                  productId: sel.productId,
                  description: sel.description,
                  unitPrice: sel.price,
                  category: 'PRODUCT',
                })}
              />
            ) : (
              <input
                className="w-full text-sm h-9 px-3 border border-gray-200 rounded-lg focus:outline-none focus:border-gold-400"
                value={it.description}
                onChange={e => onUpdate(i, 'description', e.target.value)}
                placeholder={isFr ? 'Description de la ligne…' : 'Line description…'}
              />
            )}

            {/* Catégorie · Qté · Prix · supprimer */}
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex-1 min-w-[130px]">
                <span className="block text-[10px] font-medium uppercase tracking-wide text-gray-400 mb-1">{isFr ? 'Catégorie' : 'Category'}</span>
                <select
                  value={it.category}
                  onChange={e => {
                    const next = e.target.value as ItemCategory;
                    // Switching INTO PRODUCT → reset to a blank, unlinked product row
                    // (the smart search must bind a productId). Switching OUT → drop
                    // the productId so the free-text path resumes.
                    if (next === 'PRODUCT' && !isProduct) {
                      // eslint-disable-next-line dog-universe/no-hardcoded-product-without-id -- OK: UI state reset on category switch, not an InvoiceItem create. ProductCatalogSearchSelect binds productId before save; handleSave + server Zod refine block PRODUCT without productId.
                      onPatch(i, { category: 'PRODUCT', productId: null, description: '', unitPrice: 0 });
                    } else if (next !== 'PRODUCT' && isProduct) {
                      onPatch(i, { category: next, productId: null });
                    } else {
                      onUpdate(i, 'category', next);
                    }
                  }}
                  className={`w-full text-sm h-9 px-2 rounded-lg border border-[#C4974A] bg-white focus:outline-none focus:ring-2 focus:ring-[#C4974A]/20 min-w-0 ${it.category === 'OTHER' ? 'border-l-4 border-l-amber-400' : ''}`}
                >
                  {CATEGORY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label className="w-16">
                <span className="block text-[10px] font-medium uppercase tracking-wide text-gray-400 mb-1 text-center">{isFr ? 'Qté' : 'Qty'}</span>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  className="w-full text-sm h-9 px-2 border border-gray-200 rounded-lg text-center focus:outline-none focus:border-gold-400"
                  // 0 / empty render blank so the field is freely editable — no
                  // snap-to-1. Quantity ≥ 1 is enforced at save (handleSave).
                  value={it.quantity || ''}
                  onChange={e => {
                    const raw = e.target.value;
                    const n = raw === '' ? 0 : parseInt(raw, 10);
                    onUpdate(i, 'quantity', Number.isNaN(n) ? 0 : Math.max(0, n));
                  }}
                />
              </label>
              <label className="flex-1 min-w-[110px]">
                <span className="block text-[10px] font-medium uppercase tracking-wide text-gray-400 mb-1 text-right">{isFr ? 'Prix unit.' : 'Unit price'}</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  disabled={isProduct && !it.productId}
                  className="w-full text-sm h-9 px-2 border border-gray-200 rounded-lg text-right focus:outline-none focus:border-gold-400 disabled:bg-gray-50 disabled:text-gray-400"
                  value={it.unitPrice}
                  onChange={e => onUpdate(i, 'unitPrice', parseFloat(e.target.value) || 0)}
                />
              </label>
              <button
                onClick={() => onRemove(i)}
                disabled={editItems.length === 1}
                aria-label={isFr ? 'Supprimer la ligne' : 'Remove line'}
                className="h-9 w-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-20 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Sous-total de la ligne */}
            <div className="flex justify-end items-center gap-1.5 text-xs text-gray-500 border-t border-gray-100 pt-2">
              <span>{isFr ? 'Sous-total' : 'Subtotal'}</span>
              <span className="font-semibold text-charcoal tabular-nums">{formatMAD(lineSubtotal)}</span>
            </div>
          </div>
          );
        })}
      </div>

      <button
        onClick={onAdd}
        className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-gold-700 border border-dashed border-gold-300 rounded-xl hover:bg-gold-50 transition-colors"
      >
        <Plus className="h-4 w-4" />
        {isFr ? 'Ajouter une ligne' : 'Add a line'}
      </button>

      {productMissing && (
        <p className="text-xs text-amber-700 flex items-center gap-1 mt-2">
          <AlertCircle className="h-3 w-3" />
          {isFr
            ? 'Une ligne « Produit » doit être liée au catalogue avant d\'enregistrer.'
            : 'A "Product" line must be linked to the catalog before saving.'}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between rounded-xl bg-gradient-to-r from-[#FBF5E0] to-[#F4E6BC] border border-[#E2C048]/50 px-4 py-3">
        <span className="text-sm font-medium text-charcoal/70">{isFr ? 'Total' : 'Total'}</span>
        <span className="text-xl font-bold text-charcoal tabular-nums">{formatMAD(editTotal)}</span>
      </div>
    </div>
  );
}
