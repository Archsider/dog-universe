/**
 * Unit tests — /api/admin/products (catalogue admin only).
 *
 * Verifies :
 *  - Permissions : CLIENT bloqué, ADMIN/SUPERADMIN OK
 *  - Zod validation (nom <2, prix négatif, ...)
 *  - Optimistic locking sur PATCH (VERSION_CONFLICT 409)
 *  - Archive / restore workflow
 *  - Filtres GET (category, archived, search)
 *  - ActionLog créé sur chaque mutation
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    product: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    actionLog: { create: vi.fn() },
    invoiceItem: { count: vi.fn(async () => 0) },
  },
}));

vi.mock('../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import { NextRequest } from 'next/server';

const ADMIN_SESSION = { user: { id: 'u_admin', role: 'ADMIN' } };
const CLIENT_SESSION = { user: { id: 'u_client', role: 'CLIENT' } };

function makeReq(body: unknown, url = 'https://example.com/api/admin/products'): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePatchReq(body: unknown): NextRequest {
  return new NextRequest('https://example.com/api/admin/products/p_1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function productRow(over: Partial<{ id: string; version: number; isArchived: boolean; name: string }>) {
  return {
    id: 'p_1', name: 'Royal Canin', brand: null, reference: null, category: 'FOOD',
    description: null, price: 350, costPrice: null, stock: 10, lowStockThreshold: null,
    available: true, isArchived: false, version: 0,
    targetSpecies: 'BOTH', targetAge: 'ALL', supplier: null, weight: null, imageUrl: null,
    createdAt: new Date('2026-01-01'),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(ADMIN_SESSION);
});

// ─── POST /api/admin/products ───────────────────────────────────────────────
describe('POST /api/admin/products', () => {
  it('401 when no session', async () => {
    mocks.auth.mockResolvedValue(null);
    const { POST } = await import('@/app/api/admin/products/route');
    const res = await POST(makeReq({ name: 'X', price: 10, stock: 1 }));
    expect(res.status).toBe(401);
  });

  it('401 when CLIENT role', async () => {
    mocks.auth.mockResolvedValue(CLIENT_SESSION);
    const { POST } = await import('@/app/api/admin/products/route');
    const res = await POST(makeReq({ name: 'X', price: 10, stock: 1 }));
    expect(res.status).toBe(401);
  });

  it('400 VALIDATION_ERROR when name too short (<2 chars)', async () => {
    const { POST } = await import('@/app/api/admin/products/route');
    const res = await POST(makeReq({ name: 'A', price: 10, stock: 1 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_ERROR');
  });

  it('400 VALIDATION_ERROR when price negative', async () => {
    const { POST } = await import('@/app/api/admin/products/route');
    const res = await POST(makeReq({ name: 'Valid Name', price: -5, stock: 1 }));
    expect(res.status).toBe(400);
  });

  it('201 and creates ActionLog when payload valid', async () => {
    mocks.prisma.product.create.mockResolvedValue(productRow({}));
    const { POST } = await import('@/app/api/admin/products/route');
    const res = await POST(makeReq({
      name: 'Royal Canin', category: 'FOOD', price: 350, stock: 10,
      description: 'Croquettes premium',
    }));
    expect(res.status).toBe(201);
    expect(mocks.prisma.actionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PRODUCT_CREATED',
          entityType: 'PRODUCT',
          entityId: 'p_1',
        }),
      }),
    );
  });
});

// ─── PATCH /api/admin/products/[id] ─────────────────────────────────────────
describe('PATCH /api/admin/products/[id]', () => {
  it('401 when CLIENT role', async () => {
    mocks.auth.mockResolvedValue(CLIENT_SESSION);
    const { PATCH } = await import('@/app/api/admin/products/[id]/route');
    const res = await PATCH(makePatchReq({ version: 0, name: 'X' }), { params: Promise.resolve({ id: 'p_1' }) });
    expect(res.status).toBe(401);
  });

  it('400 when body missing version', async () => {
    const { PATCH } = await import('@/app/api/admin/products/[id]/route');
    const res = await PATCH(makePatchReq({ name: 'X' }), { params: Promise.resolve({ id: 'p_1' }) });
    expect(res.status).toBe(400);
  });

  it('404 when product not found', async () => {
    mocks.prisma.product.findUnique.mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/admin/products/[id]/route');
    const res = await PATCH(makePatchReq({ version: 0, name: 'X' }), { params: Promise.resolve({ id: 'p_x' }) });
    expect(res.status).toBe(404);
  });

  it('409 VERSION_CONFLICT when client version is stale', async () => {
    mocks.prisma.product.findUnique.mockResolvedValue(productRow({ version: 5 }));
    const { PATCH } = await import('@/app/api/admin/products/[id]/route');
    const res = await PATCH(makePatchReq({ version: 3, name: 'X' }), { params: Promise.resolve({ id: 'p_1' }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('VERSION_CONFLICT');
    expect(body.currentVersion).toBe(5);
  });

  it('200 + increments version + logs PRODUCT_UPDATED on success', async () => {
    mocks.prisma.product.findUnique.mockResolvedValue(productRow({ version: 2 }));
    mocks.prisma.product.update.mockResolvedValue(productRow({ version: 3, name: 'Renamed' }));
    const { PATCH } = await import('@/app/api/admin/products/[id]/route');
    const res = await PATCH(
      makePatchReq({ version: 2, name: 'Renamed', price: 360 }),
      { params: Promise.resolve({ id: 'p_1' }) },
    );
    expect(res.status).toBe(200);
    expect(mocks.prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p_1' },
        data: expect.objectContaining({ version: { increment: 1 } }),
      }),
    );
    expect(mocks.prisma.actionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'PRODUCT_UPDATED' }) }),
    );
  });
});

// ─── Archive / Restore endpoints ────────────────────────────────────────────
describe('POST /api/admin/products/[id]/archive + /restore', () => {
  it('archive 404 when product not found', async () => {
    mocks.prisma.product.findUnique.mockResolvedValue(null);
    const { POST } = await import('@/app/api/admin/products/[id]/archive/route');
    const res = await POST(new NextRequest('https://example.com/'), { params: Promise.resolve({ id: 'p_x' }) });
    expect(res.status).toBe(404);
  });

  it('archive 401 for CLIENT', async () => {
    mocks.auth.mockResolvedValue(CLIENT_SESSION);
    const { POST } = await import('@/app/api/admin/products/[id]/archive/route');
    const res = await POST(new NextRequest('https://example.com/'), { params: Promise.resolve({ id: 'p_1' }) });
    expect(res.status).toBe(401);
  });

  it('archive sets isArchived=true and logs PRODUCT_ARCHIVED', async () => {
    mocks.prisma.product.findUnique.mockResolvedValue(productRow({ isArchived: false }));
    mocks.prisma.product.update.mockResolvedValue(productRow({ isArchived: true, version: 1 }));
    const { POST } = await import('@/app/api/admin/products/[id]/archive/route');
    const res = await POST(new NextRequest('https://example.com/'), { params: Promise.resolve({ id: 'p_1' }) });
    expect(res.status).toBe(200);
    expect(mocks.prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isArchived: true }) }),
    );
    expect(mocks.prisma.actionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'PRODUCT_ARCHIVED' }) }),
    );
  });

  it('archive idempotent when already archived (no update + no log)', async () => {
    mocks.prisma.product.findUnique.mockResolvedValue(productRow({ isArchived: true }));
    const { POST } = await import('@/app/api/admin/products/[id]/archive/route');
    const res = await POST(new NextRequest('https://example.com/'), { params: Promise.resolve({ id: 'p_1' }) });
    expect(res.status).toBe(200);
    expect(mocks.prisma.product.update).not.toHaveBeenCalled();
    expect(mocks.prisma.actionLog.create).not.toHaveBeenCalled();
  });

  it('restore sets isArchived=false and logs PRODUCT_RESTORED', async () => {
    mocks.prisma.product.findUnique.mockResolvedValue(productRow({ isArchived: true, version: 1 }));
    mocks.prisma.product.update.mockResolvedValue(productRow({ isArchived: false, version: 2 }));
    const { POST } = await import('@/app/api/admin/products/[id]/restore/route');
    const res = await POST(new NextRequest('https://example.com/'), { params: Promise.resolve({ id: 'p_1' }) });
    expect(res.status).toBe(200);
    expect(mocks.prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isArchived: false }) }),
    );
    expect(mocks.prisma.actionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'PRODUCT_RESTORED' }) }),
    );
  });
});

// ─── GET /api/admin/products — filters ──────────────────────────────────────
describe('GET /api/admin/products', () => {
  it('401 when CLIENT', async () => {
    mocks.auth.mockResolvedValue(CLIENT_SESSION);
    const { GET } = await import('@/app/api/admin/products/route');
    const res = await GET(new NextRequest('https://example.com/api/admin/products'));
    expect(res.status).toBe(401);
  });

  it('defaults to non-archived list', async () => {
    mocks.prisma.product.findMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/admin/products/route');
    await GET(new NextRequest('https://example.com/api/admin/products'));
    expect(mocks.prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isArchived: false }) }),
    );
  });

  it('honours ?archived=true', async () => {
    mocks.prisma.product.findMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/admin/products/route');
    await GET(new NextRequest('https://example.com/api/admin/products?archived=true'));
    expect(mocks.prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isArchived: true }) }),
    );
  });

  it('forwards ?category and ?search to prisma where', async () => {
    mocks.prisma.product.findMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/admin/products/route');
    await GET(new NextRequest('https://example.com/api/admin/products?category=FOOD&search=royal'));
    const call = mocks.prisma.product.findMany.mock.calls[0][0];
    expect(call.where.category).toBe('FOOD');
    expect(call.where.OR).toEqual([
      { name: { contains: 'royal', mode: 'insensitive' } },
      { reference: { contains: 'royal', mode: 'insensitive' } },
    ]);
  });
});
