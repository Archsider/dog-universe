'use client';

// Slim orchestrator — see _products-extras/ for the extracted helpers and
// modal components.
//
// File went from 505 LOC to ~155 by extracting:
//   - _products-extras/types.ts          (60L)  Category, BookingItem, CatalogProduct,
//                                                FREE_CATEGORIES, CATEGORY_LABEL, t()
//   - _products-extras/ItemRow.tsx       (75L)  single row with badge + edit/delete
//   - _products-extras/CatalogModal.tsx  (140L) catalog picker modal
//   - _products-extras/FreeLineModal.tsx (200L) create + edit free line modal

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMAD } from '@/lib/utils';
import { FileText, Plus } from 'lucide-react';
import { type BookingItem, t } from './_products-extras/types';
import { ItemRow } from './_products-extras/ItemRow';
import { CatalogModal } from './_products-extras/CatalogModal';
import { FreeLineModal } from './_products-extras/FreeLineModal';

interface Props {
  bookingId: string;
  hasInvoice: boolean;
  initialItems: BookingItem[];
  locale: string;
}

export default function ProductsExtrasSection({
  bookingId,
  hasInvoice,
  initialItems,
  locale,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<BookingItem[]>(initialItems);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showFree, setShowFree] = useState(false);
  const [editing, setEditing] = useState<BookingItem | null>(null);

  const sumTotal = useMemo(() => items.reduce((s, i) => s + i.total, 0), [items]);
  const unbilledCount = useMemo(
    () => items.filter((i) => !i.invoiceItemId).length,
    [items],
  );

  async function refresh() {
    const res = await fetch(`/api/admin/bookings/${bookingId}/items`);
    if (res.ok) setItems(await res.json());
  }

  async function deleteItem(it: BookingItem) {
    if (!confirm(t('Supprimer cette ligne ?', 'Delete this line?', locale))) return;
    setBusy(true);
    const res = await fetch(`/api/admin/bookings/${bookingId}/items/${it.id}`, {
      method: 'DELETE',
    });
    setBusy(false);
    if (res.status === 204) {
      setItems((prev) => prev.filter((x) => x.id !== it.id));
      router.refresh();
    }
  }

  async function generateSupplementary() {
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/admin/bookings/${bookingId}/invoices/supplementary`,
      { method: 'POST' },
    );
    setBusy(false);
    if (res.status === 201) {
      await refresh();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'ERROR');
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-charcoal flex items-center gap-2">
          <span>{t('Produits & Extras', 'Products & Extras', locale)}</span>
          {items.length > 0 && (
            <span className="text-xs text-gray-500">({items.length})</span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCatalog(true)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> {t('Produit catalogue', 'Catalogue', locale)}
          </button>
          <button
            onClick={() => setShowFree(true)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-200 text-charcoal text-xs font-medium hover:bg-gray-300 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> {t('Ligne libre', 'Free line', locale)}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 italic">
          {t('Aucun produit ou extra ajouté.', 'No products or extras added.', locale)}
        </p>
      ) : (
        <ul className="divide-y divide-ivory-100">
          {items.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              hasInvoice={hasInvoice}
              busy={busy}
              locale={locale}
              onEdit={(item) => setEditing(item)}
              onDelete={(item) => void deleteItem(item)}
            />
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <div className="flex justify-between items-center pt-2 border-t border-ivory-100 text-sm">
          <span className="text-gray-500">
            {t('Total Produits & Extras', 'Products & Extras total', locale)}
          </span>
          <span className="font-bold text-charcoal">{formatMAD(sumTotal)}</span>
        </div>
      )}

      {hasInvoice && unbilledCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-center justify-between gap-3">
          <div className="text-xs text-amber-800">
            {t(
              `${unbilledCount} ligne(s) non-facturée(s). Une facture complémentaire peut être générée.`,
              `${unbilledCount} unbilled line(s). A supplementary invoice can be issued.`,
              locale,
            )}
          </div>
          <button
            onClick={() => void generateSupplementary()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50 flex-shrink-0"
          >
            <FileText className="h-3.5 w-3.5" />{' '}
            {t('Facture compl.', 'Supplementary inv.', locale)}
          </button>
        </div>
      )}

      {showCatalog && (
        <CatalogModal
          bookingId={bookingId}
          locale={locale}
          onClose={() => setShowCatalog(false)}
          onAdded={(created) => {
            setItems((prev) => [...prev, created]);
            router.refresh();
          }}
        />
      )}

      {showFree && (
        <FreeLineModal
          bookingId={bookingId}
          locale={locale}
          existing={null}
          onClose={() => setShowFree(false)}
          onSaved={(created) => {
            setItems((prev) => [...prev, created]);
            router.refresh();
          }}
        />
      )}

      {editing && (
        <FreeLineModal
          bookingId={bookingId}
          locale={locale}
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
