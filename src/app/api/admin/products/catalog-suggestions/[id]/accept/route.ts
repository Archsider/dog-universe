import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth-guards';

/**
 * POST /api/admin/products/catalog-suggestions/[id]/accept
 *
 * Accept a catalog suggestion: update the underlying InvoiceItem to point at
 * the suggested product (productId + category='PRODUCT'), then mark the
 * suggestion accepted with respondedBy/At trail.
 *
 * Atomic in a single transaction. Idempotent on the suggestion side
 * (a re-accept returns 409 ALREADY_RESOLVED).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;
  const { id } = await params;

  const suggestion = await prisma.productCatalogSuggestion.findUnique({
    where: { id },
    include: { suggestedProduct: { select: { id: true, isArchived: true } } },
  });
  if (!suggestion) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (suggestion.status !== 'pending') {
    return NextResponse.json({ error: 'ALREADY_RESOLVED', status: suggestion.status }, { status: 409 });
  }
  if (!suggestion.suggestedProduct || suggestion.suggestedProduct.isArchived) {
    return NextResponse.json({ error: 'PRODUCT_UNAVAILABLE' }, { status: 400 });
  }

  // Ensure the InvoiceItem still exists. It might have been deleted (rare —
  // invoice CANCELLED + admin cleanup). Treat as soft skip.
  const item = await prisma.invoiceItem.findUnique({ where: { id: suggestion.invoiceItemId }, select: { id: true } });
  if (!item) {
    await prisma.productCatalogSuggestion.update({
      where: { id },
      data: { status: 'rejected', respondedAt: new Date(), respondedBy: session.user.id },
    });
    return NextResponse.json({ error: 'INVOICE_ITEM_GONE' }, { status: 410 });
  }

  await prisma.$transaction([
    prisma.invoiceItem.update({
      where: { id: suggestion.invoiceItemId },
      data: { productId: suggestion.suggestedProductId, category: 'PRODUCT' },
    }),
    prisma.productCatalogSuggestion.update({
      where: { id },
      data: { status: 'accepted', respondedAt: new Date(), respondedBy: session.user.id },
    }),
  ]);

  // Sidebar badge "Suggestions catalogue" derives from `pending` count —
  // accept transitions one to `accepted`, so the badge needs to drop by 1.
  // Without this the admin sees a stale count for up to 30s (cache TTL).
  revalidateTag('admin-counts');

  return NextResponse.json({ ok: true, suggestionId: id, invoiceItemId: suggestion.invoiceItemId, productId: suggestion.suggestedProductId });
}
