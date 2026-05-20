'use client';

import { formatMAD } from '@/lib/utils';
import {
  type Product,
  type ProductForm,
  CATEGORY_LABEL_EN,
  CATEGORY_LABEL_FR,
  PRODUCT_CATEGORIES,
  t,
} from './types';

interface Props {
  locale: string;
  open: boolean;
  editProduct: Product | null;
  form: ProductForm;
  setForm: (next: ProductForm | ((prev: ProductForm) => ProductForm)) => void;
  submitting: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

/**
 * Create / Edit product modal — controlled by the parent (form state +
 * open flag + error). Includes the inline margin display when both
 * cost and sale prices are set, computed live as the user types.
 */
export function ProductFormModal({
  locale,
  open,
  editProduct,
  form,
  setForm,
  submitting,
  error,
  onSubmit,
  onClose,
}: Props) {
  if (!open) return null;

  const sale = parseFloat(form.price);
  const cost = parseFloat(form.costPrice);
  const showMargin = !isNaN(sale) && !isNaN(cost) && cost > 0 && sale > 0;
  const margin = showMargin ? ((sale - cost) / sale) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-ivory-100">
          <h2 className="font-semibold text-charcoal">
            {editProduct
              ? t('Modifier le produit', 'Edit product', locale)
              : t('Nouveau produit', 'New product', locale)}
          </h2>
        </div>
        <form onSubmit={onSubmit} className="px-6 py-4 space-y-3 max-h-[80vh] overflow-y-auto">
          <Field label={t('Nom *', 'Name *', locale)}>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputCls}
              required
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('Marque', 'Brand', locale)}>
              <input
                value={form.brand}
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label={t('Référence', 'Reference', locale)}>
              <input
                value={form.reference}
                onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                className={`${inputCls} font-mono`}
              />
            </Field>
          </div>

          <Field label={t('Catégorie', 'Category', locale)}>
            <input
              list="product-category-suggestions"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder={t('ex: Alimentation, Accessoires, Hygiène…', 'e.g. Food, Accessories, Hygiene…', locale)}
              className={inputCls}
            />
            <datalist id="product-category-suggestions">
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {locale === 'en' ? CATEGORY_LABEL_EN[c] : CATEGORY_LABEL_FR[c]}
                </option>
              ))}
            </datalist>
          </Field>

          <Field label={t('Description', 'Description', locale)}>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              maxLength={500}
              className={`${inputCls} resize-none`}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('Prix de vente (MAD) *', 'Sale price (MAD) *', locale)}>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                className={inputCls}
                required
              />
            </Field>
            <Field label={t("Prix d'achat (MAD)", 'Cost price (MAD)', locale)}>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.costPrice}
                onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                className={inputCls}
              />
            </Field>
          </div>

          {showMargin && (
            <div className="text-xs text-emerald-700 bg-emerald-50/60 rounded-md px-3 py-1.5">
              {t('Marge', 'Margin', locale)} :{' '}
              <span className="font-semibold">{margin.toFixed(1)}%</span>
              {' · '}
              {formatMAD(sale - cost)}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('Stock *', 'Stock *', locale)}>
              <input
                type="number"
                min={0}
                step={1}
                value={form.stock}
                onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                className={inputCls}
                required
              />
            </Field>
            <Field label={t("Seuil d'alerte", 'Low-stock threshold', locale)}>
              <input
                type="number"
                min={0}
                step={1}
                value={form.lowStockThreshold}
                onChange={(e) => setForm((f) => ({ ...f, lowStockThreshold: e.target.value }))}
                placeholder={t("vide = pas d'alerte", 'empty = no alert', locale)}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('Espèce cible', 'Target species', locale)}>
              <select
                value={form.targetSpecies}
                onChange={(e) => setForm((f) => ({ ...f, targetSpecies: e.target.value }))}
                className={inputCls}
              >
                <option value="BOTH">{t('Chien & Chat', 'Dog & Cat', locale)}</option>
                <option value="DOG">🐕 {t('Chien', 'Dog', locale)}</option>
                <option value="CAT">🐈 {t('Chat', 'Cat', locale)}</option>
              </select>
            </Field>
            <Field label={t('Âge cible', 'Target age', locale)}>
              <select
                value={form.targetAge}
                onChange={(e) => setForm((f) => ({ ...f, targetAge: e.target.value }))}
                className={inputCls}
              >
                <option value="ALL">{t('Tout âge', 'All ages', locale)}</option>
                <option value="PUPPY">{t('Chiot/Chaton (<12 mois)', 'Puppy/Kitten (<12 mo)', locale)}</option>
                <option value="JUNIOR">{t('Jeune (12-24 mois)', 'Junior (12-24 mo)', locale)}</option>
                <option value="ADULT">{t('Adulte (2-7 ans)', 'Adult (2-7 yr)', locale)}</option>
                <option value="SENIOR">{t('Senior (7+ ans)', 'Senior (7+ yr)', locale)}</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('Fournisseur', 'Supplier', locale)}>
              <input
                value={form.supplier}
                onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
                placeholder="Ultra Premium, Canvit…"
                className={inputCls}
              />
            </Field>
            <Field label={t('Conditionnement', 'Packaging', locale)}>
              <input
                value={form.weight}
                onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                placeholder="12kg, 500ml…"
                className={inputCls}
              />
            </Field>
          </div>

          <Field label={t('URL image (optionnel)', 'Image URL (optional)', locale)}>
            <input
              type="url"
              value={form.imageUrl}
              onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
              placeholder="https://…"
              className={inputCls}
            />
          </Field>

          <div className="flex items-center gap-2">
            <input
              id="available-toggle"
              type="checkbox"
              checked={form.available}
              onChange={(e) => setForm((f) => ({ ...f, available: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-gold-500"
            />
            <label htmlFor="available-toggle" className="text-sm text-charcoal">
              {t('Disponible à la commande', 'Available for ordering', locale)}
            </label>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
            >
              {t('Annuler', 'Cancel', locale)}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-charcoal text-white text-sm font-medium disabled:opacity-50 hover:bg-charcoal/90 transition-colors"
            >
              {submitting ? '…' : editProduct ? t('Enregistrer', 'Save', locale) : t('Créer', 'Create', locale)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Tiny field wrapper — kept local to this modal because the styling is
// specific. The whole point of a 230-line modal is dense data entry; we
// don't want a generic Field component that drifts.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full border border-ivory-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold-400';
