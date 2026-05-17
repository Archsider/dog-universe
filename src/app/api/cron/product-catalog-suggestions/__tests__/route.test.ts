/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// Bypass cron auth + lock + observability — we only test the inner fn.
vi.mock('@/lib/cron-lock', () => ({ acquireCronLock: vi.fn(async () => true) }));
vi.mock('@/lib/observability', () => ({ markCronRun: vi.fn(async () => undefined) }));

const productFindMany = vi.fn();
const invoiceItemFindMany = vi.fn();
const suggestionFindMany = vi.fn();
const suggestionCreate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: { findMany: (a: any) => productFindMany(a) },
    invoiceItem: { findMany: (a: any) => invoiceItemFindMany(a) },
    productCatalogSuggestion: {
      findMany: (a: any) => suggestionFindMany(a),
      create: (a: any) => suggestionCreate(a),
    },
  },
}));

const ORIGINAL_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret';
  productFindMany.mockReset();
  invoiceItemFindMany.mockReset();
  suggestionFindMany.mockReset();
  suggestionCreate.mockReset();
  suggestionFindMany.mockResolvedValue([]);
  suggestionCreate.mockResolvedValue({ id: 'sug1' });
});

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
});

async function callCron() {
  const mod = await import('../route');
  const req = new Request('http://test/api/cron/product-catalog-suggestions', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const res = await mod.GET(req as any);
  return { status: res.status, body: await res.json() };
}

describe('GET /api/cron/product-catalog-suggestions', () => {
  it('skips when catalog is empty', async () => {
    productFindMany.mockResolvedValueOnce([]);
    const r = await callCron();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ catalogSize: 0, suggested: 0 });
    expect(invoiceItemFindMany).not.toHaveBeenCalled();
  });

  it('creates a suggestion for a high-confidence match', async () => {
    productFindMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Royal Canin Adult Medium' },
      { id: 'p2', name: 'Hills Science Plan' },
    ]);
    invoiceItemFindMany.mockResolvedValueOnce([
      { id: 'ii1', description: 'Royal Canin Adult Medium' },
    ]);
    const r = await callCron();
    expect(r.status).toBe(200);
    expect(r.body.suggested).toBe(1);
    expect(suggestionCreate).toHaveBeenCalledOnce();
    const call = suggestionCreate.mock.calls[0][0];
    expect(call.data.invoiceItemId).toBe('ii1');
    expect(call.data.suggestedProductId).toBe('p1');
    expect(call.data.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('skips items that already have a suggestion', async () => {
    productFindMany.mockResolvedValueOnce([{ id: 'p1', name: 'Royal Canin Adult Medium' }]);
    invoiceItemFindMany.mockResolvedValueOnce([
      { id: 'ii1', description: 'Royal Canin Adult Medium' },
      { id: 'ii2', description: 'Royal Canin Adult Medium' },
    ]);
    suggestionFindMany.mockResolvedValueOnce([{ invoiceItemId: 'ii1' }]);
    const r = await callCron();
    expect(r.body.suggested).toBe(1);
    expect(r.body.skipped).toBe(1);
    expect(suggestionCreate).toHaveBeenCalledTimes(1);
  });

  it('skips short descriptions and no-match rows', async () => {
    productFindMany.mockResolvedValueOnce([{ id: 'p1', name: 'Royal Canin Adult' }]);
    invoiceItemFindMany.mockResolvedValueOnce([
      { id: 'ii1', description: 'xx' }, // too short
      { id: 'ii2', description: 'Toilettage simple chien' }, // no match
    ]);
    const r = await callCron();
    expect(r.body.suggested).toBe(0);
    expect(r.body.skipped).toBeGreaterThanOrEqual(1);
    expect(suggestionCreate).not.toHaveBeenCalled();
  });

  it('treats unique-constraint race as idempotent skip', async () => {
    productFindMany.mockResolvedValueOnce([{ id: 'p1', name: 'Royal Canin Adult Medium' }]);
    invoiceItemFindMany.mockResolvedValueOnce([
      { id: 'ii1', description: 'Royal Canin Adult Medium' },
    ]);
    suggestionCreate.mockRejectedValueOnce(new Error('Unique constraint failed'));
    const r = await callCron();
    expect(r.status).toBe(200);
    expect(r.body.suggested).toBe(0);
    expect(r.body.skipped).toBe(1);
  });
});
