'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, X, Package, AlertCircle } from 'lucide-react';
import { formatMAD } from '@/lib/utils';

interface SuggestionItem {
  id: string;
  confidence: number;
  matchedTokens: string[];
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  respondedAt: string | null;
  suggestedProduct: {
    id: string;
    name: string;
    brand: string | null;
    price: number;
    category: string | null;
    isArchived: boolean;
  } | null;
  invoiceItem: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    category: string;
    invoiceId: string;
    invoiceNumber: string | null;
  } | null;
}

interface Props {
  locale: string;
  initial: SuggestionItem[];
  status: 'pending' | 'accepted' | 'rejected';
}

export default function SuggestionsClient({ locale, initial, status }: Props) {
  const fr = locale === 'fr';
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: 'accept' | 'reject') {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/catalog-suggestions/${id}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'ERROR');
      }
      // Remove the suggestion from the visible list (works on any tab —
      // pending → gone, accepted/rejected → gone too).
      setItems((prev) => prev.filter((s) => s.id !== id));
      // Refresh so the pending count badge in the sidebar updates.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ERROR');
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="border border-dashed border-gray-300 rounded-xl p-10 text-center bg-white">
        <Package className="h-10 w-10 mx-auto text-gray-300" />
        <p className="mt-3 text-sm text-gray-500">
          {fr
            ? status === 'pending'
              ? 'Aucune suggestion en attente. Le scan tourne chaque lundi à 8h UTC.'
              : status === 'accepted'
              ? 'Aucune suggestion acceptée pour le moment.'
              : 'Aucune suggestion ignorée pour le moment.'
            : status === 'pending'
            ? 'No pending suggestions. The scan runs every Monday at 08:00 UTC.'
            : status === 'accepted'
            ? 'No accepted suggestions yet.'
            : 'No rejected suggestions yet.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="border border-red-200 bg-red-50 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {items.map((s) => (
        <article
          key={s.id}
          className="border border-[#F0D98A]/40 bg-white rounded-xl p-4 sm:p-5 shadow-card"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Original invoice item */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {fr ? 'Ligne facture' : 'Invoice line'}
              </div>
              <p className="mt-1 text-sm text-charcoal font-medium break-words">
                {s.invoiceItem?.description ?? (fr ? '(supprimée)' : '(deleted)')}
              </p>
              {s.invoiceItem && (
                <div className="mt-1 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                  <span>{s.invoiceItem.quantity} × {formatMAD(s.invoiceItem.unitPrice)}</span>
                  <span>· {s.invoiceItem.category}</span>
                  {s.invoiceItem.invoiceNumber && (
                    <Link
                      href={`/${locale}/admin/billing/${s.invoiceItem.invoiceId}`}
                      className="text-[#C4974A] hover:underline"
                    >
                      {s.invoiceItem.invoiceNumber}
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Suggested product */}
            <div className="md:border-l md:border-[#F0D98A]/40 md:pl-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {fr ? 'Produit suggéré' : 'Suggested product'}
              </div>
              {s.suggestedProduct ? (
                <>
                  <p className="mt-1 text-sm text-charcoal font-medium break-words">
                    {s.suggestedProduct.name}
                    {s.suggestedProduct.brand && (
                      <span className="text-gray-500 font-normal"> — {s.suggestedProduct.brand}</span>
                    )}
                    {s.suggestedProduct.isArchived && (
                      <span className="ml-2 text-xs text-red-600">({fr ? 'archivé' : 'archived'})</span>
                    )}
                  </p>
                  <div className="mt-1 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                    <span>{formatMAD(s.suggestedProduct.price)}</span>
                    {s.suggestedProduct.category && <span>· {s.suggestedProduct.category}</span>}
                    <span className="text-emerald-700 font-medium">
                      {fr ? 'Confiance' : 'Confidence'} : {Math.round(s.confidence * 100)}%
                    </span>
                  </div>
                  {s.matchedTokens.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {s.matchedTokens.map((t) => (
                        <span key={t} className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px]">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-1 text-sm text-gray-400 italic">
                  {fr ? '(produit supprimé)' : '(product deleted)'}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          {s.status === 'pending' && (
            <div className="mt-4 pt-3 border-t border-[#F0D98A]/30 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => act(s.id, 'reject')}
                disabled={busy === s.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                {fr ? 'Ignorer' : 'Ignore'}
              </button>
              <button
                type="button"
                onClick={() => act(s.id, 'accept')}
                disabled={busy === s.id || !s.suggestedProduct || s.suggestedProduct?.isArchived || !s.invoiceItem}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C4974A] text-white text-sm font-medium hover:bg-[#a87f3a] disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {fr ? 'Accepter' : 'Accept'}
              </button>
            </div>
          )}
          {s.status !== 'pending' && (
            <div className="mt-3 pt-2 border-t border-gray-100 text-[11px] text-gray-400">
              {fr ? 'Statut' : 'Status'} : {s.status}
              {s.respondedAt && ` · ${new Date(s.respondedAt).toLocaleString(locale)}`}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
