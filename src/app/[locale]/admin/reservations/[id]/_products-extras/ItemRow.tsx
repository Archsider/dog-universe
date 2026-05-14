import { Pencil, Trash2 } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import { type BookingItem, CATEGORY_LABEL, t } from './types';

interface Props {
  item: BookingItem;
  hasInvoice: boolean;
  busy: boolean;
  locale: string;
  onEdit: (it: BookingItem) => void;
  onDelete: (it: BookingItem) => void;
}

/**
 * Single row in the Products & Extras list. Shows category badge,
 * description, quantity × unit price, and total. The right-side actions
 * (edit + delete) are hidden once the row has been billed (invoiceItemId
 * is set) — billed rows are read-only by spec.
 *
 * Edit is also hidden for catalog products (productId set) because
 * editing a catalog row's description/qty would diverge it from the
 * source product. Delete is allowed even for catalog rows.
 */
export function ItemRow({ item, hasInvoice, busy, locale, onEdit, onDelete }: Props) {
  const cfg = CATEGORY_LABEL[item.category] ?? CATEGORY_LABEL.OTHER;
  const billed = !!item.invoiceItemId;
  const isCatalog = !!item.productId;

  return (
    <li className="py-2 flex items-center gap-3">
      <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${cfg.tone}`}>
        {locale === 'en' ? cfg.en : cfg.fr}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-charcoal truncate">{item.description}</div>
        <div className="text-xs text-gray-500">
          {item.quantity} × {formatMAD(item.unitPrice)}
          {billed && (
            <span className="ml-2 text-emerald-700">
              ✓ {t('Facturé', 'Billed', locale)}
            </span>
          )}
          {!billed && hasInvoice && (
            <span className="ml-2 text-amber-700">
              {t('En attente facture compl.', 'Pending supplementary', locale)}
            </span>
          )}
        </div>
      </div>
      <div className="text-sm font-semibold text-charcoal">{formatMAD(item.total)}</div>
      {!billed && (
        <div className="flex items-center gap-1">
          {!isCatalog && (
            <button
              onClick={() => onEdit(item)}
              disabled={busy}
              className="p-1 text-gray-400 hover:text-gold-600"
              title={t('Modifier', 'Edit', locale)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => onDelete(item)}
            disabled={busy}
            className="p-1 text-gray-400 hover:text-red-600"
            title={t('Supprimer', 'Delete', locale)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </li>
  );
}
