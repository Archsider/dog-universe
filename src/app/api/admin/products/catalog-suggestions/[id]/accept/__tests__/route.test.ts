/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
vi.mock('../../../../../../../../../auth', () => ({ auth: () => authMock() }));

const suggestionFindUnique = vi.fn();
const suggestionUpdate = vi.fn();
const invoiceItemFindUnique = vi.fn();
const invoiceItemUpdate = vi.fn();
const txMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    productCatalogSuggestion: {
      findUnique: (a: any) => suggestionFindUnique(a),
      update: (a: any) => suggestionUpdate(a),
    },
    invoiceItem: {
      findUnique: (a: any) => invoiceItemFindUnique(a),
      update: (a: any) => invoiceItemUpdate(a),
    },
    $transaction: (ops: any[]) => txMock(ops),
  },
}));

beforeEach(() => {
  authMock.mockReset();
  authMock.mockReturnValue({ user: { id: 'admin1', role: 'ADMIN' } });
  suggestionFindUnique.mockReset();
  suggestionUpdate.mockReset();
  invoiceItemFindUnique.mockReset();
  invoiceItemUpdate.mockReset();
  txMock.mockReset();
  txMock.mockResolvedValue([{}, {}]);
});

async function call(id: string) {
  const mod = await import('../route');
  const req = new Request('http://test/', { method: 'POST' });
  const res = await mod.POST(req, { params: Promise.resolve({ id }) });
  return { status: res.status, body: await res.json() };
}

describe('POST /api/admin/products/catalog-suggestions/[id]/accept', () => {
  it('rejects non-admin (403)', async () => {
    authMock.mockReturnValueOnce({ user: { id: 'c1', role: 'CLIENT' } });
    const r = await call('s1');
    expect(r.status).toBe(403);
  });

  it('404 when suggestion is missing', async () => {
    suggestionFindUnique.mockResolvedValueOnce(null);
    const r = await call('missing');
    expect(r.status).toBe(404);
  });

  it('409 when already resolved', async () => {
    suggestionFindUnique.mockResolvedValueOnce({
      status: 'accepted',
      invoiceItemId: 'ii1',
      suggestedProductId: 'p1',
      suggestedProduct: { id: 'p1', isArchived: false },
    });
    const r = await call('s1');
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('ALREADY_RESOLVED');
  });

  it('400 when suggested product is archived', async () => {
    suggestionFindUnique.mockResolvedValueOnce({
      status: 'pending',
      invoiceItemId: 'ii1',
      suggestedProductId: 'p1',
      suggestedProduct: { id: 'p1', isArchived: true },
    });
    const r = await call('s1');
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('PRODUCT_UNAVAILABLE');
  });

  it('410 + soft-rejects when invoice item is gone', async () => {
    suggestionFindUnique.mockResolvedValueOnce({
      status: 'pending',
      invoiceItemId: 'ii1',
      suggestedProductId: 'p1',
      suggestedProduct: { id: 'p1', isArchived: false },
    });
    invoiceItemFindUnique.mockResolvedValueOnce(null);
    const r = await call('s1');
    expect(r.status).toBe(410);
    expect(suggestionUpdate).toHaveBeenCalledOnce();
    expect(suggestionUpdate.mock.calls[0][0].data.status).toBe('rejected');
  });

  it('happy path updates invoiceItem + marks suggestion accepted in a tx', async () => {
    suggestionFindUnique.mockResolvedValueOnce({
      status: 'pending',
      invoiceItemId: 'ii1',
      suggestedProductId: 'p1',
      suggestedProduct: { id: 'p1', isArchived: false },
    });
    invoiceItemFindUnique.mockResolvedValueOnce({ id: 'ii1' });
    const r = await call('s1');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(txMock).toHaveBeenCalledOnce();
    // The tx receives 2 ops — verify we built them, even if they aren't run individually.
    expect(txMock.mock.calls[0][0]).toHaveLength(2);
  });
});
