import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ─────────────────────────────────────────────────
vi.mock('next/server');

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    passwordResetToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  getEmailTemplate: vi.fn().mockReturnValue({ subject: 'Reset', html: '<p>Reset link</p>' }),
}));

vi.mock('@/lib/ratelimit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
  getIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

// reset-password/route.ts uses dynamic import: `const bcrypt = await import('bcryptjs')`
// then calls `bcrypt.hash(...)` — so `hash` must be a named export on the mock namespace.
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('$2a$12$newhash'), compare: vi.fn().mockResolvedValue(true) },
  hash: vi.fn().mockResolvedValue('$2a$12$newhash'),
  compare: vi.fn().mockResolvedValue(true),
}));

// ── Imports after mocks ──────────────────────────────────────────
import { POST, PUT } from '../reset-password/route';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/ratelimit';
import { sendEmail } from '@/lib/email';

// ── Helpers ──────────────────────────────────────────────────────
function postRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function putRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/reset-password', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const mockUser = {
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice',
  passwordHash: '$2a$12$oldhash',
};

// ── Tests ─────────────────────────────────────────────────────────
describe('POST /api/reset-password — request reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  });

  it('returns 200 ok even when email does not exist (prevent enumeration)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const res = await POST(postRequest({ email: 'ghost@example.com' }));
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe('ok');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('returns 200 ok when no email provided', async () => {
    const res = await POST(postRequest({}));
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe('ok');
  });

  it('returns 200 ok when rate limited (to prevent timing attacks)', async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false });
    const res = await POST(postRequest({ email: 'alice@example.com' }));
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe('ok');
  });

  it('creates reset token and sends email when user exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
    vi.mocked(prisma.passwordResetToken.create).mockResolvedValue({} as never);

    const res = await POST(postRequest({ email: 'alice@example.com' }));

    expect(res.status).toBe(200);
    expect(prisma.passwordResetToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          token: expect.any(String),
        }),
      }),
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alice@example.com' }),
    );
  });

  it('returns 200 ok even if email send fails', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
    vi.mocked(prisma.passwordResetToken.create).mockResolvedValue({} as never);
    vi.mocked(sendEmail).mockRejectedValue(new Error('SMTP error'));

    const res = await POST(postRequest({ email: 'alice@example.com' }));
    expect(res.status).toBe(200);
  });
});

describe('PUT /api/reset-password — apply reset', () => {
  const futureExpiry = new Date(Date.now() + 3_600_000); // 1 hour from now
  const pastExpiry = new Date(Date.now() - 1000);         // expired

  const validToken = {
    id: 'token-1',
    userId: 'user-1',
    token: 'valid-token-uuid',
    used: false,
    expiresAt: futureExpiry,
    user: mockUser,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue(validToken as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}] as never);
  });

  it('returns 400 when token is missing', async () => {
    const res = await PUT(putRequest({ password: 'newpassword123' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_INPUT');
  });

  it('returns 400 when password is missing', async () => {
    const res = await PUT(putRequest({ token: 'some-token' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_INPUT');
  });

  it('returns 400 when password is too short (<8 chars)', async () => {
    const res = await PUT(putRequest({ token: 'some-token', password: 'short' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_INPUT');
  });

  it('returns 400 TOKEN_EXPIRED when token is not found', async () => {
    vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue(null);
    const res = await PUT(putRequest({ token: 'bad-token', password: 'newpassword123' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('TOKEN_EXPIRED');
  });

  it('returns 400 TOKEN_EXPIRED when token is already used', async () => {
    vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
      ...validToken,
      used: true,
    } as never);
    const res = await PUT(putRequest({ token: 'used-token', password: 'newpassword123' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('TOKEN_EXPIRED');
  });

  it('returns 400 TOKEN_EXPIRED when token has expired', async () => {
    vi.mocked(prisma.passwordResetToken.findUnique).mockResolvedValue({
      ...validToken,
      expiresAt: pastExpiry,
    } as never);
    const res = await PUT(putRequest({ token: 'expired-token', password: 'newpassword123' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('TOKEN_EXPIRED');
  });

  it('returns 200 ok and marks token as used on success', async () => {
    const res = await PUT(putRequest({ token: 'valid-token-uuid', password: 'newpassword123' }));
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe('ok');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('returns 200 ok for exactly 8 character password', async () => {
    const res = await PUT(putRequest({ token: 'valid-token-uuid', password: '12345678' }));
    expect(res.status).toBe(200);
  });
});
