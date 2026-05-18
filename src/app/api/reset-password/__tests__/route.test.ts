/**
 * Tests for POST /api/reset-password.
 * Focus: anti-enumeration (always 200), email only sent when user exists,
 * timing floor (250ms minimum).
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findFirst: vi.fn() },
    passwordResetToken: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
  },
  sendEmail: vi.fn().mockResolvedValue(undefined),
  getEmailTemplate: vi.fn().mockReturnValue({ subject: 'Reset', html: '<p>link</p>' }),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/email', () => ({
  sendEmail: mocks.sendEmail,
  getEmailTemplate: mocks.getEmailTemplate,
}));

import { POST } from '@/app/api/reset-password/route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/reset-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.user.findFirst.mockResolvedValue(null);
  mocks.prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
  mocks.prisma.passwordResetToken.create.mockResolvedValue({ id: 'tok-1' });
});

describe('POST /api/reset-password — anti-enumeration', () => {
  it('always returns 200 with { message: "ok" }, even for unknown email', async () => {
    const res = await POST(makeReq({ email: 'doesnotexist@example.com' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ message: 'ok' });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('returns 200 { message: "ok" } when body is malformed (no validation leak)', async () => {
    const res = await POST(makeReq({ notAnEmail: 'foo' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ message: 'ok' });
  });

  it('returns 200 { message: "ok" } even on internal error', async () => {
    mocks.prisma.user.findFirst.mockRejectedValueOnce(new Error('DB down'));
    const res = await POST(makeReq({ email: 'foo@example.com' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ message: 'ok' });
  });
});

describe('POST /api/reset-password — happy path', () => {
  it('sends reset email when user exists', async () => {
    mocks.prisma.user.findFirst.mockResolvedValueOnce({
      id: 'user-1',
      email: 'alice@example.com',
    });
    const res = await POST(makeReq({ email: 'alice@example.com' }));
    expect(res.status).toBe(200);
    expect(mocks.prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', used: false },
    });
    expect(mocks.prisma.passwordResetToken.create).toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alice@example.com' }),
    );
  });

  it('uses locale param for email template (en)', async () => {
    mocks.prisma.user.findFirst.mockResolvedValueOnce({
      id: 'user-1',
      email: 'bob@example.com',
    });
    await POST(makeReq({ email: 'bob@example.com', locale: 'en' }));
    expect(mocks.getEmailTemplate).toHaveBeenCalledWith('reset_password', expect.any(Object), 'en');
  });
});

describe('POST /api/reset-password — timing floor', () => {
  it('takes at least ~250ms even when user does not exist (anti timing side-channel)', async () => {
    const start = Date.now();
    await POST(makeReq({ email: 'noexist@example.com' }));
    const elapsed = Date.now() - start;
    // Floor is 250ms; allow some scheduling jitter (>= 240ms)
    expect(elapsed).toBeGreaterThanOrEqual(240);
  });

  it('takes at least ~250ms when user exists', async () => {
    mocks.prisma.user.findFirst.mockResolvedValueOnce({
      id: 'user-1',
      email: 'alice@example.com',
    });
    const start = Date.now();
    await POST(makeReq({ email: 'alice@example.com' }));
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(240);
  });
});
