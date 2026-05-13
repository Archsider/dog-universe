'use client';

import { t } from './types';

interface Props {
  locale: string;
  suppliers: string[];
  categories: string[];
  filterSupplier: string;
  setFilterSupplier: (v: string) => void;
  filterSpecies: string;
  setFilterSpecies: (v: string) => void;
  filterCategory: string;
  setFilterCategory: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  showArchived: boolean;
  setShowArchived: (v: boolean) => void;
}

/**
 * Filters bar — pure controlled component. Reset button clears the three
 * dropdowns at once but does NOT touch search or showArchived (intentional:
 * those are independent intents).
 */
export function ProductsFilters({
  locale,
  suppliers,
  categories,
  filterSupplier,
  setFilterSupplier,
  filterSpecies,
  setFilterSpecies,
  filterCategory,
  setFilterCategory,
  search,
  setSearch,
  showArchived,
  setShowArchived,
}: Props) {
  const hasActiveFilters = !!(filterSupplier || filterSpecies || filterCategory);

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
      <select
        value={filterSupplier}
        onChange={(e) => setFilterSupplier(e.target.value)}
        className="border border-ivory-200 rounded-lg px-2 py-1.5 bg-white"
      >
        <option value="">{t('Tous fournisseurs', 'All suppliers', locale)}</option>
        {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      <select
        value={filterSpecies}
        onChange={(e) => setFilterSpecies(e.target.value)}
        className="border border-ivory-200 rounded-lg px-2 py-1.5 bg-white"
      >
        <option value="">{t('Toutes espèces', 'All species', locale)}</option>
        <option value="DOG">🐕 {t('Chien', 'Dog', locale)}</option>
        <option value="CAT">🐈 {t('Chat', 'Cat', locale)}</option>
        <option value="BOTH">{t('Les deux', 'Both', locale)}</option>
      </select>

      <select
        value={filterCategory}
        onChange={(e) => setFilterCategory(e.target.value)}
        className="border border-ivory-200 rounded-lg px-2 py-1.5 bg-white"
      >
        <option value="">{t('Toutes catégories', 'All categories', locale)}</option>
        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      {hasActiveFilters && (
        <button
          onClick={() => {
            setFilterSupplier('');
            setFilterSpecies('');
            setFilterCategory('');
          }}
          className="text-xs text-gray-400 hover:text-charcoal underline"
        >
          {t('Réinitialiser', 'Reset', locale)}
        </button>
      )}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('Rechercher (nom, réf.)', 'Search (name, ref.)', locale)}
        className="border border-ivory-200 rounded-lg px-2 py-1.5 bg-white flex-1 min-w-[180px]"
      />

      <label className="inline-flex items-center gap-2 ml-auto cursor-pointer">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
          className="rounded"
        />
        <span className="text-xs text-gray-600">{t('Voir archivés', 'Show archived', locale)}</span>
      </label>
    </div>
  );
}
