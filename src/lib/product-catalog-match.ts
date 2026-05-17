/**
 * Fuzzy matching helpers for product catalog suggestions.
 *
 * Used by the weekly cron `product-catalog-suggestions` to scan recent
 * InvoiceItem rows with category='OTHER' AND productId=null, and surface
 * high-confidence matches against the Product catalog for admin review.
 *
 * Pure (no Prisma / no I/O) so it's trivially testable.
 */

/**
 * Normalize a string for fuzzy matching:
 * - lowercase
 * - strip diacritics (NFD)
 * - keep only word chars + whitespace
 */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract tokens of length ≥ 3 from a normalized string. */
export function tokenize(input: string): string[] {
  return normalize(input)
    .split(' ')
    .filter((w) => w.length >= 3);
}

export interface FuzzyMatch {
  productId: string;
  productName: string;
  confidence: number; // 0..1
  matchedTokens: string[];
}

interface CandidateProduct {
  id: string;
  name: string;
}

/**
 * Score a candidate product against an item description.
 *
 * Strategy: Jaccard-ish — share the count of matched tokens between the
 * description and the candidate's name, weighted by how many of the
 * candidate's significant tokens were hit (so a "Royal Canin" description
 * doesn't false-positive against every product with "Royal" in it).
 *
 *   tokensIntersection / max(descTokens.length, prodTokens.length)
 *
 * Returns the confidence in [0..1] + the matched tokens.
 */
export function scoreMatch(description: string, product: CandidateProduct): { confidence: number; matchedTokens: string[] } {
  const descTokens = new Set(tokenize(description));
  const prodTokens = new Set(tokenize(product.name));
  if (descTokens.size === 0 || prodTokens.size === 0) return { confidence: 0, matchedTokens: [] };

  const matched: string[] = [];
  for (const t of descTokens) {
    if (prodTokens.has(t)) matched.push(t);
  }
  if (matched.length === 0) return { confidence: 0, matchedTokens: [] };

  // Confidence = matched / max(set sizes). Penalises both:
  //   - short descriptions matching too freely
  //   - long product names with one shared token
  const denom = Math.max(descTokens.size, prodTokens.size);
  const confidence = matched.length / denom;
  return { confidence: Math.min(1, confidence), matchedTokens: matched };
}

/**
 * Find the best fuzzy match for a description across the catalog.
 *
 * Returns null if no candidate scores ≥ `minConfidence` (default 0.8).
 * On ties, the candidate with the most matched tokens wins; if still tied,
 * the first one (catalogue insertion order).
 */
export function findBestMatch(
  description: string,
  catalog: CandidateProduct[],
  minConfidence = 0.8,
): FuzzyMatch | null {
  if (!description || description.trim().length < 4) return null;
  if (catalog.length === 0) return null;

  let best: FuzzyMatch | null = null;
  for (const p of catalog) {
    const { confidence, matchedTokens } = scoreMatch(description, p);
    if (confidence < minConfidence) continue;
    if (best === null || confidence > best.confidence || (confidence === best.confidence && matchedTokens.length > best.matchedTokens.length)) {
      best = { productId: p.id, productName: p.name, confidence, matchedTokens };
    }
  }
  return best;
}
