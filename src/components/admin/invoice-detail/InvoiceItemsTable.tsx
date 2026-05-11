'use client';

import { Plus, X } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import { CATEGORY_OPTIONS, type EditItem, type InvoiceData, type ItemCategory } from './lib';

// ── View mode table ──────────────────────────────────────────────────────────

export function InvoiceItemsView({ invoice, isFr }: { invoice: InvoiceData; isFr: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        {isFr ? 'Lignes de facture' : 'Line items'}
      </p>
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
}

export function InvoiceItemsEdit({
  editItems, editTotal, isFr, onAdd, onRemove, onUpdate,
}: EditProps) {
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          {isFr ? 'Lignes de facture' : 'Line items'}
        </p>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-gold-700 border border-gold-300 rounded-lg hover:bg-gold-50 transition-colors"
        >
          <Plus className="h-3 w-3" />
          {isFr ? 'Ajouter une ligne' : 'Add row'}
        </button>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 px-1">
          <span className="col-span-4">{isFr ? 'Description' : 'Description'}</span>
          <span className="col-span-3">{isFr ? 'Catégorie' : 'Category'}</span>
          <span className="col-span-1 text-center">{isFr ? 'Qté' : 'Qty'}</span>
          <span className="col-span-3 text-right">{isFr ? 'Prix unit.' : 'Unit price'}</span>
          <span className="col-span-1" />
        </div>

        {editItems.map((it, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input
              className="col-span-4 text-sm h-8 px-2 border border-gray-200 rounded-lg focus:outline-none focus:border-gold-400"
              value={it.description}
              onChange={e => onUpdate(i, 'description', e.target.value)}
              placeholder={isFr ? 'Description' : 'Description'}
            />
            <select
              value={it.category}
              onChange={e => onUpdate(i, 'category', e.target.value)}
              className={`col-span-3 text-sm h-8 px-2 rounded-lg border border-[#C4974A] bg-white focus:outline-none focus:ring-2 focus:ring-[#C4974A]/20 min-w-0 ${it.category === 'OTHER' ? 'border-l-4 border-l-amber-400' : ''}`}
            >
              {CATEGORY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              className="col-span-1 text-sm h-8 px-2 border border-gray-200 rounded-lg text-center focus:outline-none focus:border-gold-400"
              value={it.quantity}
              onChange={e => onUpdate(i, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
            />
            <input
              type="number"
              min={0}
              step={0.01}
              className="col-span-3 text-sm h-8 px-2 border border-gray-200 rounded-lg text-right focus:outline-none focus:border-gold-400"
              value={it.unitPrice}
              onChange={e => onUpdate(i, 'unitPrice', parseFloat(e.target.value) || 0)}
            />
            <button
              onClick={() => onRemove(i)}
              disabled={editItems.length === 1}
              className="col-span-1 flex items-center justify-center text-gray-400 hover:text-red-500 disabled:opacity-20 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex justify-end mt-3 pt-2 border-t border-ivory-100">
        <span className="text-sm font-bold text-charcoal">
          Total : {editTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD
        </span>
      </div>
    </div>
  );
}
