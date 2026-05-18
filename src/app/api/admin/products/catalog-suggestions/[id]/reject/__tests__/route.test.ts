/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
vi.mock('../../../../../../../../../auth', () => ({ auth: () => authMock() }));
// revalidateTag is called after a successful reject (drop sidebar count);
// stub it so we don't pull in Next's static-gen context in unit tests.
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

const suggestionFindUnique = vi.fn();
const suggestionUpdate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    productCatalogSuggestion: {
      findUnique: (a: any) => suggestionFindUnique(a),
      update: (a: any) => suggestionUpdate(a),
    },
  },
}));

beforeEach(() => {
  authMock.mockReset();
  authMock.mockReturnValue({ user: { id: 'admin1', role: 'SUPERADMIN' } });
  suggestionFindUnique.mockReset();
  suggestionUpdate.mockReset();
  suggestionUpdate.mockResolvedValue({});
});

async function call(id: string) {
  const mod = await import('../route');
  const req = new Request('http://test/', { method: 'POST' });
  const res = await mod.POST(req, { params: Promise.resolve({ id }) });
  return { status: res.status, body: await res.json() };
}

describe('POST /api/admin/products/catalog-suggestions/[id]/reject', () => {
  it('rejects unauthenticated (401)', async () => {
    authMock.mockReturnValueOnce(null);
    const r = await call('s1');
    expect(r.status).toBe(401);
  });

  it('404 when suggestion missing', async () => {
    suggestionFindUnique.mockResolvedValueOnce(null);
    const r = await call('missing');
    expect(r.status).toBe(404);
  });

  it('409 when already accepted', async () => {
    suggestionFindUnique.mockResolvedValueOnce({ status: 'accepted' });
    const r = await call('s1');
    expect(r.status).toBe(409);
  });

  it('happy path marks suggestion rejected with audit trail', async () => {
    suggestionFindUnique.mockResolvedValueOnce({ status: 'pending' });
    const r = await call('s1');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(suggestionUpdate).toHaveBeenCalledOnce();
    const args = suggestionUpdate.mock.calls[0][0];
    expect(args.where.id).toBe('s1');
    expect(args.data.status).toBe('rejected');
    expect(args.data.respondedBy).toBe('admin1');
    expect(args.data.respondedAt).toBeInstanceOf(Date);
  });
});
