/**
 * Unit tests — TOTP replay protection (`verifyTotpForUser` in src/lib/totp.ts)
 *
 * On mocke `decryptSecret` (renvoie un secret valide) et `otplib.verify`
 * (toujours valid:true). On vérifie purement la fenêtre anti-replay 90 s
 * + la persistance via `prisma.user.update` quand `persist: true`.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'crypto';

const mocks = vi.hoisted(() => ({
  prisma: { user: { update: vi.fn().mockResolvedValue(undefined) } },
  verify: vi.fn(async () => ({ valid: true })),
  generate: vi.fn(),
  generateSecret: vi.fn(() => 'SECRET'),
  decryptSecret: vi.fn(() => 'PLAINTEXT_SECRET'),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('../../lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('../../lib/crypto', () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock('@/lib/crypto', () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock('otplib', () => ({
  verify: mocks.verify,
  generate: mocks.generate,
  generateSecret: mocks.generateSecret,
}));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn() } }));

import { verifyTotpForUser } from '@/lib/totp';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue({ valid: true });
  mocks.decryptSecret.mockReturnValue('PLAINTEXT_SECRET');
});

describe('verifyTotpForUser — replay protection', () => {
  it('rejects same token replayed within 90 s window', async () => {
    const user = {
      id: 'u1',
      totpSecret: 'enc::v1::ciphertext',
      lastTotpToken: '123456',
      lastTotpUsedAt: new Date(Date.now() - 30_000), // 30 s ago
    };
    const res = await verifyTotpForUser(user, '123456');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('REPLAY');
    // Replay path must short-circuit BEFORE crypto/verify
    expect(mocks.decryptSecret).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it('accepts same token after the 90 s window has expired', async () => {
    const user = {
      id: 'u1',
      totpSecret: 'enc::v1::ciphertext',
      lastTotpToken: '123456',
      lastTotpUsedAt: new Date(Date.now() - 120_000), // 2 min ago
    };
    const res = await verifyTotpForUser(user, '123456');
    expect(res.ok).toBe(true);
    expect(mocks.verify).toHaveBeenCalled();
  });

  it('accepts a DIFFERENT token in the same window (no replay)', async () => {
    const user = {
      id: 'u1',
      totpSecret: 'enc::v1::ciphertext',
      lastTotpToken: '111111',
      lastTotpUsedAt: new Date(Date.now() - 10_000),
    };
    const res = await verifyTotpForUser(user, '222222');
    expect(res.ok).toBe(true);
  });

  it('persists lastTotpToken + lastTotpUsedAt when persist:true', async () => {
    const user = {
      id: 'u-persist',
      totpSecret: 'enc::v1::ciphertext',
      lastTotpToken: null,
      lastTotpUsedAt: null,
    };
    const res = await verifyTotpForUser(user, '654321', { persist: true });
    expect(res.ok).toBe(true);
    // Tokens are SHA-256-hashed at rest (audit S-M1). The stored value
    // is the hex digest, not the raw 6-digit code.
    const expectedHash = createHash('sha256').update('654321').digest('hex');
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-persist' },
      data: expect.objectContaining({
        lastTotpToken: expectedHash,
        lastTotpUsedAt: expect.any(Date),
      }),
    });
  });

  it('does NOT persist when persist flag is omitted', async () => {
    const user = {
      id: 'u-nopersist',
      totpSecret: 'enc::v1::ciphertext',
      lastTotpToken: null,
      lastTotpUsedAt: null,
    };
    const res = await verifyTotpForUser(user, '654321');
    expect(res.ok).toBe(true);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects replay when stored value is the SHA-256 hash (post-migration row)', async () => {
    const hash = createHash('sha256').update('111222').digest('hex');
    const user = {
      id: 'u-hashed',
      totpSecret: 'enc::v1::ciphertext',
      lastTotpToken: hash, // stored as hash after the S-M1 fix
      lastTotpUsedAt: new Date(Date.now() - 30_000),
    };
    const res = await verifyTotpForUser(user, '111222');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('REPLAY');
  });

  it('still rejects replay when stored value is legacy plaintext (pre-migration row)', async () => {
    // Backwards-compat: a row written before S-M1 still matches.
    const user = {
      id: 'u-legacy',
      totpSecret: 'enc::v1::ciphertext',
      lastTotpToken: '777888', // legacy plaintext
      lastTotpUsedAt: new Date(Date.now() - 30_000),
    };
    const res = await verifyTotpForUser(user, '777888');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('REPLAY');
  });

  it('returns NO_SECRET when user has no TOTP enrolled', async () => {
    const user = { id: 'u1', totpSecret: null, lastTotpToken: null, lastTotpUsedAt: null };
    const res = await verifyTotpForUser(user, '123456');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('NO_SECRET');
  });

  it('returns INVALID_TOKEN when otplib rejects', async () => {
    mocks.verify.mockResolvedValueOnce({ valid: false });
    const user = {
      id: 'u1',
      totpSecret: 'enc::v1::ciphertext',
      lastTotpToken: null,
      lastTotpUsedAt: null,
    };
    const res = await verifyTotpForUser(user, '999999');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('INVALID_TOKEN');
  });
});
