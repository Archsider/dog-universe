'use client';

// Step 2 — Smart, category-aware line items with live total.
//
// Service categories (Pension / Pet Taxi / Toilettage) expose a small
// pet-context editor (species, name, nights, size, trip type) and DERIVE
// the description + unit price from the canonical business rules
// (`deriveWalkinLine`). PRODUCT renders the catalog smart-search. OTHER /
// DISCOUNT keep free-text manual entry. DISCOUNT auto-normalises the sign.

import { Plus, Trash2, AlertCircle, Minus } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import ProductCatalogSearchSelect from '@/components/admin/ProductCatalogSearchSelect';
import { CATEGORY_LABELS, type ItemCategory, type WalkinItem } from './types';
import {
  deriveWalkinLine,
  isServiceCategory,
  type WalkinSpecies,
  type WalkinGroomingSize,
  type WalkinTaxiType,
} from './walkin-line-derive';

interface Props {
  fr: boolean;
  items: WalkinItem[];
  total: number;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<WalkinItem>) => void;
}

const CATEGORY_ICON: Record<ItemCategory, string> = {
  BOARDING: '🏠',
  PET_TAXI: '🚗',
  GROOMING: '✂️',
  PRODUCT: '🛍️',
  OTHER: '•',
  DISCOUNT: '％',
};

const SPECIES: { value: WalkinSpecies; emoji: string; fr: string; en: string }[] = [
  { value: 'DOG', emoji: '🐕', fr: 'Chien', en: 'Dog' },
  { value: 'CAT', emoji: '🐈', fr: 'Chat', en: 'Cat' },
];
const SIZES: { value: WalkinGroomingSize; fr: string; en: string }[] = [
  { value: 'SMALL', fr: 'Petit', en: 'Small' },
  { value: 'LARGE', fr: 'Grand', en: 'Large' },
];
const TAXI_TYPES: { value: WalkinTaxiType; fr: string; en: string }[] = [
  { value: 'STANDARD', fr: 'Ville', en: 'City' },
  { value: 'VET', fr: 'Véto', en: 'Vet' },
  { value: 'AIRPORT', fr: 'Aéroport', en: 'Airport' },
];

export default function WalkinItemsStep({ fr, items, total, onAdd, onRemove, onUpdate }: Props) {
  const loc = fr ? 'fr' : 'en';

  // Apply a context change, then re-derive description + unitPrice + qty
  // from the merged item so the operator always sees a coherent line.
  function patchContext(it: WalkinItem, patch: Partial<WalkinItem>) {
    const merged = { ...it, ...patch };
    const derived = deriveWalkinLine(merged.category, merged, loc);
    if (derived) {
      onUpdate(it.id, {
        ...patch,
        description: derived.description,
        quantity: derived.quantity,
        // unitPrice null = no canonical rate (monthly boarding) → keep the
        // operator's manual price, only auto-set when a rate was derived.
        ...(derived.unitPrice != null ? { unitPrice: derived.unitPrice } : {}),
      });
    } else {
      onUpdate(it.id, patch);
    }
  }

  // Per-night BOARDING: let the operator enter check-in / check-out dates;
  // we derive `nights` from the span (noon-anchored, DST-free Casa math) and
  // re-derive the line via patchContext. The Stepper stays as a manual
  // alternative. Dates are UI-only (not sent to the server).
  function applyDates(it: WalkinItem, checkIn: string, checkOut: string) {
    const patch: Partial<WalkinItem> = { checkIn, checkOut };
    if (checkIn && checkOut) {
      const a = new Date(`${checkIn}T12:00:00Z`).getTime();
      const b = new Date(`${checkOut}T12:00:00Z`).getTime();
      const nights = Math.round((b - a) / 86_400_000);
      if (Number.isFinite(nights) && nights >= 1) patch.nights = nights;
    }
    patchContext(it, patch);
  }

  function changeCategory(it: WalkinItem, next: ItemCategory) {
    // DISCOUNT sign normalisation.
    let unit = it.unitPrice;
    if (next === 'DISCOUNT' && unit >= 0) unit = -Math.abs(unit) || -1;
    if (next !== 'DISCOUNT' && unit < 0) unit = Math.abs(unit);

    if (next === 'PRODUCT') {
      onUpdate(it.id, { category: next, productId: null, description: '', unitPrice: 0, quantity: 1 });
      return;
    }
    if (isServiceCategory(next)) {
      // Initialise sensible service defaults + derive immediately.
      const defaults: Partial<WalkinItem> = {
        category: next,
        productId: null,
        species: next === 'PET_TAXI' ? it.species : (it.species ?? 'DOG'),
        nights: next === 'BOARDING' ? (it.nights ?? 1) : it.nights,
        groomingSize: next === 'GROOMING' ? (it.groomingSize ?? 'SMALL') : it.groomingSize,
        taxiType: next === 'PET_TAXI' ? (it.taxiType ?? 'STANDARD') : it.taxiType,
      };
      const merged = { ...it, ...defaults };
      const derived = deriveWalkinLine(next, merged, loc);
      onUpdate(it.id, {
        ...defaults,
        ...(derived
          ? {
              description: derived.description,
              quantity: derived.quantity,
              ...(derived.unitPrice != null ? { unitPrice: derived.unitPrice } : {}),
            }
          : {}),
      });
      return;
    }
    // OTHER / DISCOUNT — manual free text.
    onUpdate(it.id, { category: next, unitPrice: unit, productId: null });
  }

  return (
    <div className="space-y-3">
      {items.map((it) => {
        const isDiscount = it.category === 'DISCOUNT';
        const isProduct = it.category === 'PRODUCT';
        const isService = isServiceCategory(it.category);
        const productMissing = isProduct && !it.productId;
        const lineTotal = Math.round(it.quantity * it.unitPrice * 100) / 100;

        return (
          <div
            key={it.id}
            className={`rounded-xl border overflow-hidden ${
              isDiscount
                ? 'border-red-200 bg-red-50/30'
                : productMissing
                ? 'border-amber-200 bg-amber-50/30'
                : 'border-[#F0D98A]/50 bg-white'
            }`}
          >
            {/* Header row : category chip + delete */}
            <div className="flex items-center gap-2 px-3 py-2 bg-[#FBF5E0]/40 border-b border-[#F0D98A]/30">
              <span className="text-base" aria-hidden>{CATEGORY_ICON[it.category]}</span>
              <select
                value={it.category}
                onChange={(e) => changeCategory(it, e.target.value as ItemCategory)}
                className="flex-1 bg-transparent text-sm font-medium text-charcoal focus:outline-none cursor-pointer"
              >
                {(Object.keys(CATEGORY_LABELS) as ItemCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {fr ? CATEGORY_LABELS[cat].fr : CATEGORY_LABELS[cat].en}
                  </option>
                ))}
              </select>
              <span className="text-sm font-semibold tabular-nums text-charcoal/80">
                {formatMAD(lineTotal)}
              </span>
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

            <div className="p-3 space-y-3">
              {/* ── Smart service editor ────────────────────────────── */}
              {isService && (
                <>
                  {/* Species (boarding + grooming) */}
                  {(it.category === 'BOARDING' || it.category === 'GROOMING') && (
                    <ToggleRow
                      label={fr ? 'Espèce' : 'Species'}
                      options={SPECIES.map((s) => ({ value: s.value, label: `${s.emoji} ${fr ? s.fr : s.en}` }))}
                      value={it.species ?? 'DOG'}
                      onChange={(v) => patchContext(it, { species: v as WalkinSpecies })}
                    />
                  )}

                  {/* Grooming size */}
                  {it.category === 'GROOMING' && (
                    <ToggleRow
                      label={fr ? 'Taille' : 'Size'}
                      options={SIZES.map((s) => ({ value: s.value, label: fr ? s.fr : s.en }))}
                      value={it.groomingSize ?? 'SMALL'}
                      onChange={(v) => patchContext(it, { groomingSize: v as WalkinGroomingSize })}
                    />
                  )}

                  {/* Taxi trip type */}
                  {it.category === 'PET_TAXI' && (
                    <ToggleRow
                      label={fr ? 'Type de trajet' : 'Trip type'}
                      options={TAXI_TYPES.map((t) => ({ value: t.value, label: fr ? t.fr : t.en }))}
                      value={it.taxiType ?? 'STANDARD'}
                      onChange={(v) => patchContext(it, { taxiType: v as WalkinTaxiType })}
                    />
                  )}

                  {/* Boarding billing unit : per-night OR per-month */}
                  {it.category === 'BOARDING' && (
                    <ToggleRow
                      label={fr ? 'Facturation' : 'Billing'}
                      options={[
                        { value: 'NIGHT', label: fr ? 'À la nuit' : 'Per night' },
                        { value: 'MONTH', label: fr ? 'Au mois' : 'Per month' },
                      ]}
                      value={it.billingUnit ?? 'NIGHT'}
                      onChange={(v) => patchContext(it, { billingUnit: v as 'NIGHT' | 'MONTH' })}
                    />
                  )}

                  {/* Boarding dates (per-night) → auto-fills the nights count */}
                  {it.category === 'BOARDING' && (it.billingUnit ?? 'NIGHT') === 'NIGHT' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">{fr ? 'Arrivée' : 'Check-in'}</label>
                        <input
                          type="date"
                          value={it.checkIn ?? ''}
                          onChange={(e) => applyDates(it, e.target.value, it.checkOut ?? '')}
                          className="w-full px-2 py-1.5 rounded-md border border-[#E2C048]/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">{fr ? 'Départ' : 'Check-out'}</label>
                        <input
                          type="date"
                          value={it.checkOut ?? ''}
                          min={it.checkIn || undefined}
                          onChange={(e) => applyDates(it, it.checkIn ?? '', e.target.value)}
                          className="w-full px-2 py-1.5 rounded-md border border-[#E2C048]/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
                        />
                      </div>
                    </div>
                  )}

                  {/* Pet name + (boarding) duration stepper */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">
                        {fr ? 'Nom de l\'animal' : 'Pet name'}
                      </label>
                      <input
                        type="text"
                        value={it.petName ?? ''}
                        onChange={(e) => patchContext(it, { petName: e.target.value })}
                        placeholder={fr ? 'Ex : Max' : 'E.g. Max'}
                        className="w-full px-2 py-1.5 rounded-md border border-[#E2C048]/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
                        maxLength={60}
                      />
                    </div>
                    {it.category === 'BOARDING' && (
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">
                          {(it.billingUnit ?? 'NIGHT') === 'MONTH' ? (fr ? 'Mois' : 'Months') : (fr ? 'Nuits' : 'Nights')}
                        </label>
                        <Stepper
                          value={it.nights ?? 1}
                          onChange={(n) => patchContext(it, { nights: n })}
                        />
                      </div>
                    )}
                  </div>

                  {/* Derived line preview + editable unit price */}
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-[#FBF5E0]/40 px-3 py-2">
                    <span className="text-xs text-charcoal/70 truncate">{it.description || (fr ? '—' : '—')}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        step="0.01"
                        value={it.unitPrice}
                        onChange={(e) => onUpdate(it.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                        className="w-20 px-2 py-1 rounded-md border border-[#E2C048]/40 text-sm tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40"
                      />
                      <span className="text-xs text-gray-500">
                        {it.category === 'BOARDING'
                          ? (it.billingUnit ?? 'NIGHT') === 'MONTH'
                            ? (fr ? '/mois' : '/month')
                            : (fr ? '/nuit' : '/night')
                          : 'MAD'}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* ── Product catalog search ──────────────────────────── */}
              {isProduct && (
                <div className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-12 md:col-span-7">
                    <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">
                      {fr ? 'Produit' : 'Product'} <span className="text-emerald-600">· {fr ? 'catalogue' : 'catalog'}</span>
                    </label>
                    <ProductCatalogSearchSelect
                      locale={loc}
                      value={{ productId: it.productId ?? null, description: it.description, price: it.unitPrice }}
                      serverError={productMissing ? (fr ? 'Sélectionne un produit ou crée-le.' : 'Pick or create a product.') : null}
                      onChange={(sel) => onUpdate(it.id, {
                        productId: sel.productId, description: sel.description, unitPrice: sel.price, category: 'PRODUCT',
                      })}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">{fr ? 'Qté' : 'Qty'}</label>
                    <input type="number" min="1" step="1" inputMode="numeric" value={it.quantity || ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const n = raw === '' ? 0 : parseInt(raw, 10);
                        onUpdate(it.id, { quantity: Number.isNaN(n) ? 0 : Math.max(0, n) });
                      }}
                      className="w-full px-2 py-1.5 rounded-md border border-[#E2C048]/40 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40" />
                  </div>
                  <div className="col-span-8 md:col-span-3">
                    <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">{fr ? 'Prix unit.' : 'Unit'}</label>
                    <input type="number" step="0.01" value={it.unitPrice} disabled={!it.productId}
                      onChange={(e) => onUpdate(it.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 rounded-md border border-[#E2C048]/40 text-sm tabular-nums disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40" />
                  </div>
                </div>
              )}

              {/* ── Free-text (OTHER / DISCOUNT) ────────────────────── */}
              {!isService && !isProduct && (
                <div className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-12 md:col-span-7">
                    <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">{fr ? 'Description' : 'Description'}</label>
                    <input type="text" value={it.description}
                      onChange={(e) => onUpdate(it.id, { description: e.target.value })}
                      placeholder={isDiscount ? (fr ? 'Ex : Remise fidélité' : 'E.g. Loyalty discount') : (fr ? 'Ex : Divers' : 'E.g. Misc')}
                      className="w-full px-2 py-1.5 rounded-md border border-[#E2C048]/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40" maxLength={200} />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">{fr ? 'Qté' : 'Qty'}</label>
                    <input type="number" min="1" step="1" inputMode="numeric" value={it.quantity || ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const n = raw === '' ? 0 : parseInt(raw, 10);
                        onUpdate(it.id, { quantity: Number.isNaN(n) ? 0 : Math.max(0, n) });
                      }}
                      className="w-full px-2 py-1.5 rounded-md border border-[#E2C048]/40 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C4974A]/40" />
                  </div>
                  <div className="col-span-8 md:col-span-3">
                    <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">{fr ? 'Prix unit.' : 'Unit'}</label>
                    <input type="number" step="0.01" value={it.unitPrice}
                      onChange={(e) => onUpdate(it.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                      className={`w-full px-2 py-1.5 rounded-md border text-sm tabular-nums focus:outline-none focus:ring-2 ${
                        isDiscount ? 'border-red-300 text-red-700 focus:ring-red-300' : 'border-[#E2C048]/40 focus:ring-[#C4974A]/40'
                      }`} />
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <button type="button" onClick={onAdd}
        className="w-full inline-flex items-center justify-center gap-1 py-2 rounded-lg border-2 border-dashed border-[#E2C048]/40 text-sm text-[#C4974A] hover:bg-[#FBF5E0]/40 font-medium">
        <Plus className="h-4 w-4" />
        {fr ? 'Ajouter une ligne' : 'Add a line'}
      </button>

      <div className="flex items-baseline justify-between pt-3 border-t border-[#F0D98A]/30">
        <span className="text-sm font-medium text-charcoal">{fr ? 'Total facture' : 'Invoice total'}</span>
        <span className={`text-2xl font-bold tabular-nums ${total <= 0 ? 'text-red-600' : 'text-emerald-700'}`}>
          {formatMAD(total)}
        </span>
      </div>
      {total <= 0 && (
        <p className="text-xs text-red-600 text-right">{fr ? 'Le total doit être strictement positif.' : 'Total must be strictly positive.'}</p>
      )}
      {items.some((it) => it.category === 'PRODUCT' && !it.productId) && (
        <p className="text-xs text-amber-700 flex items-center gap-1 justify-end">
          <AlertCircle className="h-3 w-3" />
          {fr ? 'Une ligne « Produit » n\'est pas liée au catalogue.' : 'A "Product" line is missing a catalog link.'}
        </p>
      )}
    </div>
  );
}

// ── Small UI primitives ─────────────────────────────────────────────────

function ToggleRow({
  label, options, value, onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">{label}</label>
      <div className="flex gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex-1 py-1.5 px-2 rounded-md text-sm font-medium border transition-colors ${
              value === o.value
                ? 'border-[#C4974A] bg-[#C4974A]/10 text-[#8B6914]'
                : 'border-[#E2C048]/30 text-gray-500 hover:border-[#C4974A]/40'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center border border-[#E2C048]/40 rounded-md overflow-hidden">
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))}
        className="px-2 py-1.5 text-gray-500 hover:bg-[#FBF5E0]/60" aria-label="−">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input type="number" min="1" step="1" value={value}
        onChange={(e) => onChange(Math.max(1, parseInt(e.target.value || '1', 10) || 1))}
        className="w-10 text-center py-1.5 text-sm tabular-nums focus:outline-none border-x border-[#E2C048]/40" />
      <button type="button" onClick={() => onChange(value + 1)}
        className="px-2 py-1.5 text-gray-500 hover:bg-[#FBF5E0]/60" aria-label="+">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
