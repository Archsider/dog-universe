'use client';

import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import type { CustomLine } from './lib';

interface Props {
  fr: boolean;
  customLines: CustomLine[];
  validCount: number;
  showCustomLines: boolean;
  setShowCustomLines: React.Dispatch<React.SetStateAction<boolean>>;
  addCustomLine: () => void;
  removeCustomLine: (i: number) => void;
  updateCustomLine: (i: number, field: keyof CustomLine, value: string | number) => void;
}

export function CustomLinesSection({
  fr, customLines, validCount, showCustomLines, setShowCustomLines,
  addCustomLine, removeCustomLine, updateCustomLine,
}: Props) {
  return (
    <section>
      <button
        type="button"
        onClick={() => setShowCustomLines(v => !v)}
        className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 hover:text-charcoal transition-colors"
      >
        {showCustomLines ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {fr ? 'Produits / services additionnels' : 'Extra products / services'}
        {validCount > 0 && (
          <span className="ml-1 bg-gold-100 text-gold-700 text-xs rounded-full px-1.5 py-0.5">
            {validCount}
          </span>
        )}
      </button>

      {showCustomLines && (
        <div className="space-y-2">
          {customLines.map((line, i) => (
            <div key={i} className="grid grid-cols-[1fr_44px_28px] sm:grid-cols-[1fr_60px_90px_32px] gap-2 items-center">
              <input
                type="text"
                value={line.description}
                onChange={e => updateCustomLine(i, 'description', e.target.value)}
                placeholder={fr ? 'Description…' : 'Description…'}
                className="border border-gray-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-gold-400"
              />
              <input
                type="number"
                min={1}
                value={line.quantity}
                onChange={e => updateCustomLine(i, 'quantity', parseInt(e.target.value) || 1)}
                className="border border-gray-200 rounded-lg text-xs px-2 py-1.5 text-center focus:outline-none focus:border-gold-400"
              />
              <input
                type="number"
                min={0}
                step={1}
                value={line.unitPrice === 0 ? '' : line.unitPrice}
                onChange={e => updateCustomLine(i, 'unitPrice', parseFloat(e.target.value) || 0)}
                placeholder="P.U. MAD"
                className="border border-gray-200 rounded-lg text-xs px-2 py-1.5 text-right focus:outline-none focus:border-gold-400"
              />
              <button
                type="button"
                onClick={() => removeCustomLine(i)}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addCustomLine}
            className="flex items-center gap-1.5 text-xs text-gold-600 hover:text-gold-700 font-medium py-1"
          >
            <Plus className="h-3.5 w-3.5" />
            {fr ? 'Ajouter une ligne' : 'Add line'}
          </button>
        </div>
      )}
    </section>
  );
}
