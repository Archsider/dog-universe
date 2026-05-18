import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { defineCron } from '@/lib/cron-runner';
import { findBestMatch } from '@/lib/product-catalog-match';

export const maxDuration = 60;

/**
 * GET /api/cron/product-catalog-suggestions
 *
 * Weekly (Monday 08h UTC). Scans `InvoiceItem` rows created in the last 7
 * days with `category='OTHER'` AND `productId IS NULL` AND
 * `LENGTH(description) >= 4`. For each row, fuzzy-matches against the active
 * Product catalog. Confidence ≥ 0.8 → upsert into ProductCatalogSuggestion
 * (status=pending). Skipped if the row is already in the table (unique on
 * invoiceItemId).
 *
 * No SMS/email — admin reviews on /admin/products/suggestions.
 */
export const GET = defineCron({
  name: 'product-catalog-suggestions',
  period: 'weekly',
  fn: async ({ now, logger }) => {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

    // Fetch catalog once (cap 1000 — same as the admin route).
    const catalog = await prisma.product.findMany({
      where: { isArchived: false, available: true },
      select: { id: true, name: true },
      take: 1000,
    });
    if (catalog.length === 0) {
      logger.info('cron-product-catalog-suggestions', 'empty catalog — skip', {});
      return { scanned: 0, suggested: 0, skipped: 0, catalogSize: 0 };
    }

    // Recent OTHER items without a productId, missing a suggestion already.
    // We pull invoiceItem rows + LEFT JOIN check via the unique index on
    // ProductCatalogSuggestion.invoiceItemId — done in two queries to avoid
    // a complex raw SQL on Prisma 5.
    const recentItems = await prisma.invoiceItem.findMany({
      where: {
        category: 'OTHER',
        productId: null,
        invoice: { createdAt: { gte: sevenDaysAgo } },
      },
      select: { id: true, description: true },
      take: 500,
    });
    if (recentItems.length === 0) {
      return { scanned: 0, suggested: 0, skipped: 0, catalogSize: catalog.length };
    }

    const itemIds = recentItems.map((it) => it.id);
    const existing = await prisma.productCatalogSuggestion.findMany({
      where: { invoiceItemId: { in: itemIds } },
      select: { invoiceItemId: true },
    });
    const existingIds = new Set(existing.map((e) => e.invoiceItemId));

    let suggested = 0;
    let skipped = 0;
    let noMatch = 0;
    for (const item of recentItems) {
      if (existingIds.has(item.id)) { skipped++; continue; }
      if (!item.description || item.description.length < 4) { skipped++; continue; }

      const match = findBestMatch(item.description, catalog, 0.8);
      if (!match) { noMatch++; continue; }

      try {
        await prisma.productCatalogSuggestion.create({
          data: {
            invoiceItemId: item.id,
            suggestedProductId: match.productId,
            confidence: match.confidence,
            matchedTokens: match.matchedTokens,
          },
        });
        suggested++;
      } catch (err) {
        // P2002 = unique violation (someone created it between our findMany
        // and our create). Idempotent — just skip.
        logger.info('cron-product-catalog-suggestions', 'skip (race or fk)', {
          invoiceItemId: item.id,
          error: err instanceof Error ? err.message : String(err),
        });
        skipped++;
      }
    }

    // New `pending` suggestions just landed — the sidebar badge count
    // needs to refresh so the admin sees them on the next page load
    // (otherwise they'd wait up to 30s for the cache TTL). Only call
    // when we actually created something to avoid pointless invalidations.
    if (suggested > 0) {
      revalidateTag('admin-counts');
    }

    return { scanned: recentItems.length, suggested, skipped, noMatch, catalogSize: catalog.length };
  },
});
