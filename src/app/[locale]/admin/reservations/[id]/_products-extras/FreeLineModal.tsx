'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { type BookingItem, type Category, CATEGORY_LABEL, FREE_CATEGORIES, t } from './types';

interface Props {
  bookingId: string;
  locale: string;
  /** Pass an existing item to switch to edit mode (PATCH instead of POST). */
  existing: BookingItem | null;
  onClose: () => void;
  onSaved: (it: BookingItem) => void;
}

/**
 * Create / edit a free booking-item line (no catalog product). The
 * `existing` prop drives the dual-mode behaviour:
 *   - existing = null → POST /items (create)
 *   - existing = row  → PATCH /items/[id] (edit, version-locked)
 *
 * Validation:
 *   - description, quantity ≥ 1, unitPrice numeric
 *   - DISCOUNT category must have a non-positive price (the back-end
 *     also enforces this; the front-end pre-check gives instant feedback).
 */
export function FreeLineModal({ bookingId, locale, existing, onClose, onSaved }: Props) {
  const initial = existing ?? null;
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<Category>(
    initial?.category && FREE_CATEGORIES.includes(initial.category)
      ? initial.category
      : 'EXTRA_SERVICE',
  );
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 1));
  const [unitPrice, setUnitPrice] = useState(String(initial?.unitPrice ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const qty = parseInt(quantity, 10);
    const price = parseFloat(unitPrice);
    if (!description.trim() || isNaN(qty) || qty < 1 || isNaN(price)) {
      setError(t('Champs invalides', 'Invalid fields', locale));
      setBusy(false);
      return;
    }
    if (category === 'DISCOUNT' && price > 0) {
      setError(
        t(
          'Une remise doit avoir un prix négatif ou nul.',
          'A discount must have a non-positive price.',
          locale,
        ),
      );
      setBusy(false);
      return;
    }

    if (existing) {
      const res = await fetch(`/api/admin/bookings/${bookingId}/items/${existing.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          version: existing.version,
          description: description.trim(),
          category,
          quantity: qty,
          unitPrice: price,
        }),
      });
      setBusy(false);
      if (res.ok) {
        onSaved(await res.json());
        onClose();
      } else {
        setError((await res.json().catch(() => ({}))).error ?? 'ERROR');
      }
    } else {
      const res = await fetch(`/api/admin/bookings/${bookingId}/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'free',
          description: description.trim(),
          category,
          quantity: qty,
          unitPrice: price,
        }),
      });
      setBusy(false);
      if (res.ok) {
        onSaved(await res.json());
        onClose();
      } else {
        setError((await res.json().catch(() => ({}))).error ?? 'ERROR');
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <form
        onSubmit={save}
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-charcoal">
            {existing
              ? t('Modifier la ligne', 'Edit line', locale)
              : t('Nouvelle ligne libre', 'New free line', locale)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-charcoal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {t('Description *', 'Description *', locale)}
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              {t('Catégorie *', 'Category *', locale)}
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm"
            >
              {FREE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {locale === 'en' ? CATEGORY_LABEL[c].en : CATEGORY_LABEL[c].fr}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              {t('Quantité *', 'Quantity *', locale)}
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {t('Prix unitaire (MAD) *', 'Unit price (MAD) *', locale)}
            {category === 'DISCOUNT' && (
              <span className="ml-1 text-amber-700">
                ({t('négatif pour remise', 'negative for discount', locale)})
              </span>
            )}
          </label>
          <input
            type="number"
            step={0.01}
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            className="w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm"
            required
          />
        </div>
        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            {t('Annuler', 'Cancel', locale)}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-1.5 rounded-lg bg-charcoal text-white text-sm font-medium disabled:opacity-50 hover:bg-charcoal/90"
          >
            {busy
              ? '…'
              : existing
                ? t('Enregistrer', 'Save', locale)
                : t('Ajouter', 'Add', locale)}
          </button>
        </div>
      </form>
    </div>
  );
}
