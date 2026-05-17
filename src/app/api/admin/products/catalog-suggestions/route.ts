import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/decimal';
import { requireRole } from '@/lib/auth-guards';

/**
 * GET /api/admin/products/catalog-suggestions
 *
 * Returns ProductCatalogSuggestion rows for admin review on
 * /admin/products/suggestions. Drives the "smart catalog" workflow:
 * cron creates pending rows, admin accepts/rejects, accepted ones flip the
 * underlying InvoiceItem to (productId, category='PRODUCT').
 *
 * Query params:
 *   - status: 'pending' | 'accepted' | 'rejected' (default 'pending')
 *   - limit: 1..100 (default 25)
 */
export async function GET(request: NextRequest) {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'pending';
  const allowed = new Set(['pending', 'accepted', 'rejected']);
  if (!allowed.has(status)) {
    return NextResponse.json({ error: 'INVALID_STATUS' }, { status: 400 });
  }
  const limitRaw = parseInt(searchParams.get('limit') ?? '25', 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 25;

  const suggestions = await prisma.productCatalogSuggestion.findMany({
    where: { status },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      suggestedProduct: {
        select: { id: true, name: true, brand: true, price: true, category: true, isArchived: true },
      },
    },
  });

  const itemIds = suggestions.map((s) => s.invoiceItemId);
  const items = itemIds.length > 0
    ? await prisma.invoiceItem.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, description: true, quantity: true, unitPrice: true, category: true, invoiceId: true },
      })
    : [];
  const itemMap = new Map(items.map((i) => [i.id, i]));

  const pendingCount = await prisma.productCatalogSuggestion.count({ where: { status: 'pending' } });

  return NextResponse.json({
    pendingCount,
    suggestions: suggestions.map((s) => ({
      id: s.id,
      confidence: s.confidence,
      matchedTokens: s.matchedTokens,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
      respondedAt: s.respondedAt?.toISOString() ?? null,
      respondedBy: s.respondedBy,
      suggestedProduct: s.suggestedProduct ? {
        id: s.suggestedProduct.id,
        name: s.suggestedProduct.name,
        brand: s.suggestedProduct.brand,
        price: toNumber(s.suggestedProduct.price),
        category: s.suggestedProduct.category,
        isArchived: s.suggestedProduct.isArchived,
      } : null,
      invoiceItem: (() => {
        const it = itemMap.get(s.invoiceItemId);
        if (!it) return null;
        return {
          id: it.id,
          description: it.description,
          quantity: it.quantity,
          unitPrice: toNumber(it.unitPrice),
          category: it.category,
          invoiceId: it.invoiceId,
        };
      })(),
    })),
  });
}
