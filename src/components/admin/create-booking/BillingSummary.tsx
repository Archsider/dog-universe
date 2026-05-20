'use client';

import { formatMAD } from '@/lib/utils';

interface Line {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Props {
  fr: boolean;
  allLines: Line[];
  computedTotal: number;
  finalTotal: number;
  manualOverride: boolean;
  setManualOverride: (v: boolean) => void;
  manualTotal: string;
  setManualTotal: (v: string) => void;
}

export function BillingSummary({
  fr, allLines, computedTotal, finalTotal,
  manualOverride, setManualOverride, manualTotal, setManualTotal,
}: Props) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
        {fr ? 'Récapitulatif facturation' : 'Billing summary'}
      </h3>

      {allLines.length === 0 ? (
        <p className="text-xs text-gray-400 italic py-2">
          {fr ? 'Aucune ligne — renseignez les dates et animaux.' : 'No lines yet — fill in dates and pets.'}
        </p>
      ) : (
        <div className="border border-ivory-200 rounded-xl overflow-hidden">
          <div className="bg-ivory-50 px-3 py-2 hidden sm:grid sm:grid-cols-[1fr_44px_80px_72px] gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            <span>{fr ? 'Description' : 'Description'}</span>
            <span className="text-center">{fr ? 'Qté' : 'Qty'}</span>
            <span className="text-right">{fr ? 'P.U.' : 'Unit'}</span>
            <span className="text-right">Total</span>
          </div>
          {allLines.map((line, i) => (
            <div
              key={i}
              className="px-3 py-2 hidden sm:grid sm:grid-cols-[1fr_44px_80px_72px] gap-2 border-t border-ivory-100 text-xs items-center"
            >
              <span className="text-charcoal">{line.description}</span>
              <span className="text-center text-gray-500">{line.quantity}</span>
              <span className="text-right text-gray-500">{formatMAD(line.unitPrice)}</span>
              <span className="text-right font-medium text-charcoal">{formatMAD(line.total)}</span>
            </div>
          ))}
          <div className="px-3 py-2.5 border-t border-gold-200/60 bg-ivory-50 flex justify-between items-center">
            <span className="text-sm font-bold text-charcoal">
              {fr ? 'Total calculé' : 'Computed total'}
            </span>
            <span className="text-base font-bold text-gold-600">{formatMAD(computedTotal)}</span>
          </div>
        </div>
      )}

      <div className="mt-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={manualOverride}
            onChange={e => {
              setManualOverride(e.target.checked);
              if (e.target.checked) setManualTotal(String(computedTotal));
            }}
            className="w-4 h-4 rounded border-gray-300 text-amber-500"
          />
          <span className="text-sm text-gray-600">
            {fr ? 'Forcer le total manuellement' : 'Override total manually'}
          </span>
        </label>
        {manualOverride && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={1}
              value={manualTotal}
              onChange={e => setManualTotal(e.target.value)}
              className="flex-1 border border-amber-300 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-amber-500 bg-amber-50"
              placeholder="Montant MAD"
            />
            <span className="text-sm text-gray-500">MAD</span>
            <span className="text-xs text-amber-600">
              {fr ? `(calculé : ${formatMAD(computedTotal)})` : `(computed: ${formatMAD(computedTotal)})`}
            </span>
          </div>
        )}
      </div>

      {allLines.length > 0 && (
        <div className="mt-3 flex justify-between items-center px-3 py-2.5 bg-charcoal text-white rounded-xl">
          <span className="text-sm font-semibold">
            {fr ? 'Total réservation' : 'Booking total'}
            {manualOverride && <span className="text-xs text-amber-300 ml-1.5">(override)</span>}
          </span>
          <span className="text-lg font-bold">{formatMAD(finalTotal)}</span>
        </div>
      )}
    </section>
  );
}
