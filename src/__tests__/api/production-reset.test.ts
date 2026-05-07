/**
 * Unit tests — POST /api/admin/production-reset (Sprint 1 sécurité)
 *
 * Couvre les guards de re-auth :
 *   - non-SUPERADMIN     → 403
 *   - confirm token KO   → 400 CONFIRMATION_REQUIRED
 *   - password absent    → 400 PASSWORD_REQUIRED
 *   - password invalide  → 403 INVALID_PASSWORD
 *   - dryRun             → preview sans effet
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    user: { count: vi.fn(), findUnique: vi.fn() },
    pet: { count: vi.fn() },
    booking: { count: vi.fn() },
    invoice: { count: vi.fn() },
    notification: { count: vi.fn() },
    clientContract: { count: vi.fn() },
    loyaltyBenefitClaim: { count: vi.fn() },
    actionLog: { count: vi.fn() },
    adminNote: { count: vi.fn() },
    passwordResetToken: { count: vi.fn() },
    $transaction: vi.fn(),
  },
  bcryptCompare: vi.fn(),
  logAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/log', () => ({ logAction: mocks.logAction }));
vi.mock('bcryptjs', () => ({
  default: { compare: mocks.bcryptCompare, hash: vi.fn() },
  compare: mocks.bcryptCompare,
  hash: vi.fn(),
}));
// Disable Redis path entirely (returns null → fail-open allow)
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({ incr: vi.fn(), expire: vi.fn() })),
}));

import { POST } from '@/app/api/admin/production-reset/route';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/production-reset', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default counts (used by both dryRun and confirm paths)
  for (const m of [
    mocks.prisma.user.count,
    mocks.prisma.pet.count,
    mocks.prisma.booking.count,
    mocks.prisma.invoice.count,
    mocks.prisma.notification.count,
    mocks.prisma.clientContract.count,
    mocks.prisma.loyaltyBenefitClaim.count,
    mocks.prisma.actionLog.count,
    mocks.prisma.adminNote.count,
    mocks.prisma.passwordResetToken.count,
  ]) {
    m.mockResolvedValue(0);
  }
  mocks.auth.mockResolvedValue({
    user: { id: 'super-1', role: 'SUPERADMIN', email: 'super@du.test' },
  });
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe('POST /api/admin/production-reset — auth guards', () => {
  it('returns 403 when caller is not SUPERADMIN', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'a', role: 'ADMIN' } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(403);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns dryRun preview without performing destructive ops', async () => {
    const res = await POST(makeRequest({ dryRun: true }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dryRun).toBe(true);
    expect(json.wouldDelete).toBeDefined();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 400 CONFIRMATION_REQUIRED when token is missing or wrong', async () => {
    const res = await POST(makeRequest({ confirm: 'WRONG', password: 'pw' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('CONFIRMATION_REQUIRED');
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 400 PASSWORD_REQUIRED when password missing', async () => {
    const res = await POST(makeRequest({ confirm: 'PRODUCTION_RESET_IRREVERSIBLE' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('PASSWORD_REQUIRED');
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 403 INVALID_PASSWORD when bcrypt compare fails', async () => {
    mocks.prisma.user.findUnique.mockResolvedValueOnce({ passwordHash: 'hash' });
    mocks.bcryptCompare.mockResolvedValueOnce(false);
    const res = await POST(
      makeRequest({ confirm: 'PRODUCTION_RESET_IRREVERSIBLE', password: 'wrong' }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('INVALID_PASSWORD');
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PRODUCTION_RESET_BLOCKED' }),
    );
  });
});
