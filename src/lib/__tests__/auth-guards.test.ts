import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock('../../../auth', () => ({ auth: mockAuth }));

import { requireRole, requireTotpSatisfied } from '../auth-guards';

beforeEach(() => {
  mockAuth.mockReset();
});

describe('requireRole', () => {
  it('returns 401 Unauthorized when no session', async () => {
    mockAuth.mockResolvedValueOnce(null);
    const result = await requireRole(['ADMIN']);
    expect(result.error).toBeDefined();
    expect(result.error?.status).toBe(401);
    const body = await result.error!.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 Unauthorized when session has no user', async () => {
    mockAuth.mockResolvedValueOnce({ user: undefined } as never);
    const result = await requireRole(['ADMIN']);
    expect(result.error?.status).toBe(401);
  });

  it('returns 403 Forbidden when role does not match', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'u1', role: 'CLIENT' } } as never);
    const result = await requireRole(['ADMIN', 'SUPERADMIN']);
    expect(result.error?.status).toBe(403);
    const body = await result.error!.json();
    expect(body).toEqual({ error: 'Forbidden' });
  });

  it('returns the session when role matches (single-role allowlist)', async () => {
    const session = { user: { id: 'u1', role: 'ADMIN' } } as never;
    mockAuth.mockResolvedValueOnce(session);
    const result = await requireRole(['ADMIN']);
    expect(result.error).toBeUndefined();
    expect(result.session).toBe(session);
  });

  it('returns the session when role is in multi-role allowlist', async () => {
    const session = { user: { id: 'u1', role: 'SUPERADMIN' } } as never;
    mockAuth.mockResolvedValueOnce(session);
    const result = await requireRole(['ADMIN', 'SUPERADMIN']);
    expect(result.session).toBe(session);
  });

  it('SUPERADMIN cannot access a CLIENT-only route (allowlist semantics)', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'u1', role: 'SUPERADMIN' } } as never);
    const result = await requireRole(['CLIENT']);
    expect(result.error?.status).toBe(403);
  });
});

describe('requireTotpSatisfied', () => {
  it('returns null when no session', async () => {
    mockAuth.mockResolvedValueOnce(null);
    expect(await requireTotpSatisfied()).toBeNull();
  });

  it('returns null when totpPending is false', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'u1', role: 'ADMIN', totpPending: false } } as never);
    expect(await requireTotpSatisfied()).toBeNull();
  });

  it('returns null when totpPending is undefined', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'u1', role: 'ADMIN' } } as never);
    expect(await requireTotpSatisfied()).toBeNull();
  });

  it('returns 403 TOTP_REQUIRED when totpPending is true', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'u1', role: 'ADMIN', totpPending: true } } as never);
    const result = await requireTotpSatisfied();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
    const body = await result!.json();
    expect(body).toEqual({ error: 'TOTP_REQUIRED' });
  });

  it('returns null (fail-safe) when auth() throws', async () => {
    mockAuth.mockRejectedValueOnce(new Error('JWT decode failed'));
    expect(await requireTotpSatisfied()).toBeNull();
  });
});
