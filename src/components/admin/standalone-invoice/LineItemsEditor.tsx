'use client';

import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CATEGORY_OPTIONS, QUICK_ADD_PRESETS, type LineItem, type CatalogProduct, type QuickAddPreset } from './types';

interface LineItemsEditorProps {
  items: LineItem[];
  catalog: CatalogProduct[];
  locale: string;
  onAddItem: () => void;
  onRemoveItem: (i: number) => void;
  onUpdateItem: (i: number, field: keyof LineItem, value: string | number | undefined) => void;
  onAddPreset: (preset: QuickAddPreset) => void;
}

export function LineItemsEditor({
  items,
  catalog,
  locale,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
  onAddPreset,
}: LineItemsEditorProps) {
  const fr = locale === 'fr';

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

          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <Input
                className="col-span-4 text-sm h-8"
                list="invoice-products-datalist"
                value={it.description}
                onChange={e => onUpdateItem(i, 'description', e.target.value)}
                placeholder={fr ? 'Tape ou choisis un produit du catalogue…' : 'Type or pick from catalogue…'}
              />
              <select
                value={it.category}
                onChange={e => onUpdateItem(i, 'category', e.target.value)}
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
          ))}
        </div>

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
