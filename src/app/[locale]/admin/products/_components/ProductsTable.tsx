'use client';

import { Pencil, Archive, ArchiveRestore, AlertTriangle } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import { StockBadge } from './StockBadge';
import { type Product, AGE_LABEL, SPECIES_LABEL, isLowStock, t } from './types';

interface Props {
  locale: string;
  products: Product[];
  archiveBusy: string | null;
  onEdit: (p: Product) => void;
  onAdjustStock: (p: Product) => void;
  onToggleAvailable: (p: Product) => void;
  onArchive: (p: Product) => void;
  onRestore: (p: Product) => void;
}

/**
 * ProductsTable — pure presentational table. All mutations go through
 * callbacks owned by the parent. The "low stock" pill in the name cell
 * is gated on a per-product threshold, distinct from the generic stock
 * badge tier.
 */
export function ProductsTable({
  locale,
  products,
  archiveBusy,
  onEdit,
  onAdjustStock,
  onToggleAvailable,
  onArchive,
  onRestore,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#FAF6F0] border-b border-[#F0D98A]/40">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-charcoal">{t('Nom', 'Name', locale)}</th>
              <th className="px-4 py-3 text-left font-semibold text-charcoal">{t('Fournisseur', 'Supplier', locale)}</th>
              <th className="px-4 py-3 text-left font-semibold text-charcoal">{t('Catégorie', 'Category', locale)}</th>
              <th className="px-4 py-3 text-center font-semibold text-charcoal">{t('Espèce', 'Species', locale)}</th>
              <th className="px-4 py-3 text-center font-semibold text-charcoal">{t('Âge', 'Age', locale)}</th>
              <th className="px-4 py-3 text-right font-semibold text-charcoal">{t('Prix', 'Price', locale)}</th>
              <th className="px-4 py-3 text-center font-semibold text-charcoal">{t('Stock', 'Stock', locale)}</th>
              <th className="px-4 py-3 text-center font-semibold text-charcoal">{t('Dispo', 'Available', locale)}</th>
              <th className="px-4 py-3 text-right font-semibold text-charcoal">{t('Actions', 'Actions', locale)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ivory-100">
            {products.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">
                  {t('Aucun produit. Cliquez sur "+ Ajouter" pour commencer.', 'No products. Click "+ Add product" to get started.', locale)}
                </td>
              </tr>
            )}
            {products.map((p) => (
              <tr
                key={p.id}
                className={`transition-colors ${isLowStock(p) ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-[#FAF6F0]/50'}`}
              >
                <td className="px-4 py-3 font-medium text-charcoal">
                  {p.name}
                  {p.weight && <span className="text-xs text-gray-400 ml-1">· {p.weight}</span>}
                  {isLowStock(p) && (
                    <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">
                      <AlertTriangle className="h-3 w-3" /> {t('seuil', 'low', locale)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">{p.supplier ?? p.brand ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{p.category ?? '—'}</td>
                <td className="px-4 py-3 text-center text-gray-500 text-xs">
                  {SPECIES_LABEL[p.targetSpecies ?? 'BOTH']}
                </td>
                <td className="px-4 py-3 text-center text-gray-500 text-xs">
                  {AGE_LABEL[p.targetAge ?? 'ALL']}
                </td>
                <td className="px-4 py-3 text-right font-medium text-charcoal">{formatMAD(p.price)}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <StockBadge stock={p.stock} />
                    <button
                      onClick={() => onAdjustStock(p)}
                      className="text-gray-400 hover:text-gold-600 transition-colors"
                      title={t('Ajuster stock', 'Adjust stock', locale)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => onToggleAvailable(p)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${p.available ? 'bg-green-500' : 'bg-gray-300'}`}
                    title={p.available ? t('Désactiver', 'Disable', locale) : t('Activer', 'Enable', locale)}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${p.available ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onEdit(p)}
                      className="px-2 py-1 rounded-md text-xs font-medium text-gray-500 hover:text-gold-600 hover:bg-gold-50 transition-colors"
                      title={t('Modifier', 'Edit', locale)}
                    >
                      {t('Modifier', 'Edit', locale)}
                    </button>
                    {p.isArchived ? (
                      <button
                        onClick={() => onRestore(p)}
                        disabled={archiveBusy === p.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                        title={t('Restaurer', 'Restore', locale)}
                      >
                        <ArchiveRestore className="h-3.5 w-3.5" />
                        {t('Restaurer', 'Restore', locale)}
                      </button>
                    ) : (
                      <button
                        onClick={() => onArchive(p)}
                        disabled={archiveBusy === p.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-gray-500 hover:text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-colors"
                        title={t('Archiver', 'Archive', locale)}
                      >
                        <Archive className="h-3.5 w-3.5" />
                        {t('Archiver', 'Archive', locale)}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
