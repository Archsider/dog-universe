/**
 * API tests — PATCH/DELETE /api/admin/feature-flags/[key]
 *
 * Surface tested:
 *   - Auth: SUPERADMIN-only (ADMIN gets 403)
 *   - Validation: rolloutPercent 0-100, targetRoles enum, userWhitelist size cap
 *   - Strict schema: unknown keys rejected
 *   - Cache invalidation: invalidateFlagCache called on success
 *   - DELETE: NOT_FOUND mapping
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  flagUpdate: vi.fn(),
  flagDelete: vi.fn(),
  invalidate: vi.fn(async () => undefined),
}));

vi.mock('../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    featureFlag: { update: mocks.flagUpdate, delete: mocks.flagDelete },
  },
}));
vi.mock('@/lib/feature-flags', () => ({ invalidateFlagCache: mocks.invalidate }));

import { PATCH, DELETE } from '@/app/api/admin/feature-flags/[key]/route';

function patchReq(body: unknown): Request {
  return new Request('http://localhost/api/admin/feature-flags/my-flag', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ key: 'my-flag' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'sa1', role: 'SUPERADMIN' } });
  mocks.flagUpdate.mockResolvedValue({ key: 'my-flag', enabled: true, rolloutPercent: 50 });
});

describe('PATCH /api/admin/feature-flags/[key] — auth', () => {
  it('returns 403 for ADMIN', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'a1', role: 'ADMIN' } });
    const res = await PATCH(patchReq({ enabled: false }) as never, ctx);
    expect(res.status).toBe(403);
    expect(mocks.flagUpdate).not.toHaveBeenCalled();
  });

  it('returns 403 for CLIENT', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'c1', role: 'CLIENT' } });
    const res = await PATCH(patchReq({ enabled: false }) as never, ctx);
    expect(res.status).toBe(403);
  });

  it('returns 401 when no session', async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const res = await PATCH(patchReq({ enabled: false }) as never, ctx);
    expect(res.status).toBe(401);
  });

  it('accepts SUPERADMIN', async () => {
    const res = await PATCH(patchReq({ enabled: true }) as never, ctx);
    expect(res.status).toBe(200);
  });
});

describe('PATCH — validation', () => {
  it('rejects rolloutPercent < 0', async () => {
    const res = await PATCH(patchReq({ rolloutPercent: -10 }) as never, ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_ERROR');
  });

  it('rejects rolloutPercent > 100', async () => {
    const res = await PATCH(patchReq({ rolloutPercent: 101 }) as never, ctx);
    expect(res.status).toBe(400);
  });

  it('rejects unknown role in targetRoles', async () => {
    const res = await PATCH(patchReq({ targetRoles: ['HACKER'] }) as never, ctx);
    expect(res.status).toBe(400);
  });

  it('rejects unknown body keys (strict schema)', async () => {
    const res = await PATCH(patchReq({ enabled: true, secretBackdoor: 'x' }) as never, ctx);
    expect(res.status).toBe(400);
  });

  it('rejects userWhitelist of more than 500 entries', async () => {
    const list = Array.from({ length: 501 }, (_, i) => `u-${i}`);
    const res = await PATCH(patchReq({ userWhitelist: list }) as never, ctx);
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON body', async () => {
    const req = new Request('http://localhost/api/admin/feature-flags/my-flag', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const res = await PATCH(req as never, ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_BODY');
  });

  it('accepts a valid partial update', async () => {
    const res = await PATCH(
      patchReq({ enabled: false, rolloutPercent: 25, targetRoles: ['ADMIN', 'SUPERADMIN'] }) as never,
      ctx,
    );
    expect(res.status).toBe(200);
    expect(mocks.flagUpdate).toHaveBeenCalledWith({
      where: { key: 'my-flag' },
      data: { enabled: false, rolloutPercent: 25, targetRoles: ['ADMIN', 'SUPERADMIN'] },
    });
  });
});

describe('PATCH — cache invalidation + 404 mapping', () => {
  it('calls invalidateFlagCache on successful update', async () => {
    await PATCH(patchReq({ enabled: true }) as never, ctx);
    expect(mocks.invalidate).toHaveBeenCalledWith('my-flag');
  });

  it('returns 404 if Prisma update throws (key not found)', async () => {
    mocks.flagUpdate.mockRejectedValueOnce(new Error('not found'));
    const res = await PATCH(patchReq({ enabled: true }) as never, ctx);
    expect(res.status).toBe(404);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/feature-flags/[key]', () => {
  it('returns 403 for ADMIN', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'a1', role: 'ADMIN' } });
    const res = await DELETE(new Request('http://localhost/x', { method: 'DELETE' }) as never, ctx);
    expect(res.status).toBe(403);
  });

  it('deletes + invalidates cache for SUPERADMIN', async () => {
    mocks.flagDelete.mockResolvedValueOnce({});
    const res = await DELETE(new Request('http://localhost/x', { method: 'DELETE' }) as never, ctx);
    expect(res.status).toBe(200);
    expect(mocks.flagDelete).toHaveBeenCalledWith({ where: { key: 'my-flag' } });
    expect(mocks.invalidate).toHaveBeenCalledWith('my-flag');
  });

  it('returns 404 when flag does not exist', async () => {
    mocks.flagDelete.mockRejectedValueOnce(new Error('not found'));
    const res = await DELETE(new Request('http://localhost/x', { method: 'DELETE' }) as never, ctx);
    expect(res.status).toBe(404);
  });
});
