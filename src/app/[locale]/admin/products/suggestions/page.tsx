import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/decimal';
import SuggestionsClient from './SuggestionsClient';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}

export default async function CatalogSuggestionsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { status: statusParam } = await searchParams;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    redirect(`/${locale}/auth/login`);
  }
  const fr = locale === 'fr';

  const status = statusParam === 'accepted' || statusParam === 'rejected' ? statusParam : 'pending';

  // Parallelize suggestions fetch + pending count — the two are
  // independent.  The InvoiceItem lookup depends on the suggestion ids so
  // it stays serial.  Total wall-clock save : ~60–80 ms on this page.
  const [suggestions, pendingCount] = await Promise.all([
    prisma.productCatalogSuggestion.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        suggestedProduct: {
          select: { id: true, name: true, brand: true, price: true, category: true, isArchived: true },
        },
      },
    }),
    prisma.productCatalogSuggestion.count({ where: { status: 'pending' } }),
  ]);

  const itemIds = suggestions.map((s) => s.invoiceItemId);
  const items = itemIds.length > 0
    ? await prisma.invoiceItem.findMany({
        where: { id: { in: itemIds } },
        select: {
          id: true,
          description: true,
          quantity: true,
          unitPrice: true,
          category: true,
          invoiceId: true,
          invoice: { select: { invoiceNumber: true } },
        },
      })
    : [];
  const itemMap = new Map(items.map((i) => [i.id, i]));

  const serialized = suggestions.map((s) => {
    const it = itemMap.get(s.invoiceItemId);
    return {
      id: s.id,
      confidence: s.confidence,
      matchedTokens: s.matchedTokens,
      status: s.status as 'pending' | 'accepted' | 'rejected',
      createdAt: s.createdAt.toISOString(),
      respondedAt: s.respondedAt?.toISOString() ?? null,
      suggestedProduct: s.suggestedProduct ? {
        id: s.suggestedProduct.id,
        name: s.suggestedProduct.name,
        brand: s.suggestedProduct.brand,
        price: toNumber(s.suggestedProduct.price),
        category: s.suggestedProduct.category,
        isArchived: s.suggestedProduct.isArchived,
      } : null,
      invoiceItem: it ? {
        id: it.id,
        description: it.description,
        quantity: it.quantity,
        unitPrice: toNumber(it.unitPrice),
        category: it.category,
        invoiceId: it.invoiceId,
        invoiceNumber: it.invoice?.invoiceNumber ?? null,
      } : null,
    };
  });

  return (
    <div className="max-w-5xl mx-auto py-6 px-4">
      <div className="mb-6">
        <Link href={`/${locale}/admin/products`} className="text-sm text-[#C4974A] hover:underline">
          ← {fr ? 'Retour aux produits' : 'Back to products'}
        </Link>
        <h1 className="text-2xl font-bold text-charcoal mt-2">
          {fr ? 'Suggestions catalogue' : 'Catalog suggestions'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {fr
            ? 'Lignes "Autre" récentes que le scan hebdomadaire pense pouvoir lier à un produit du catalogue.'
            : 'Recent "Other" lines the weekly scan thinks it can link to a catalog product.'}
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        {(['pending', 'accepted', 'rejected'] as const).map((s) => (
          <Link
            key={s}
            href={`/${locale}/admin/products/suggestions?status=${s}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
              status === s
                ? 'bg-[#C4974A] text-white border-[#C4974A]'
                : 'bg-white text-charcoal/70 border-gray-200 hover:border-[#C4974A]/40'
            }`}
          >
            {fr
              ? s === 'pending' ? `En attente${s === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}` : s === 'accepted' ? 'Acceptées' : 'Ignorées'
              : s === 'pending' ? `Pending${s === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}` : s === 'accepted' ? 'Accepted' : 'Rejected'}
          </Link>
        ))}
      </div>

      <SuggestionsClient locale={locale} initial={serialized} status={status} />
    </div>
  );
}
