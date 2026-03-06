import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks (hoisted by vitest) ────────────────────────────
vi.mock('next/server');

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    loyaltyGrade: {
      create: vi.fn(),
    },
  },
}));

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('$2a$12$hashed') },
}));

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  getEmailTemplate: vi.fn().mockReturnValue({ subject: 'Welcome', html: '<p>Hi</p>' }),
}));

vi.mock('@/lib/notifications', () => ({
  createWelcomeNotification: vi.fn().mockResolvedValue(undefined),
  createAdminNewClientNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/log', () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
  LOG_ACTIONS: { USER_REGISTER: 'USER_REGISTER' },
}));

vi.mock('@/lib/ratelimit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
  getIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

// ── Imports after mocks ──────────────────────────────────────────
import { POST } from '../register/route';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/ratelimit';
import { sendEmail } from '@/lib/email';
import { createWelcomeNotification } from '@/lib/notifications';

// ── Helpers ──────────────────────────────────────────────────────
function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validUser = {
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice',
  role: 'CLIENT' as const,
  phone: null,
  language: 'fr',
  passwordHash: '$2a$12$hashed',
};

// ── Tests ─────────────────────────────────────────────────────────
describe('POST /api/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(validUser as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.loyaltyGrade.create).mockResolvedValue({} as never);
  });

  // ── Validation errors ─────────────────────────────────────────
  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest({ email: 'a@b.com', password: 'password123' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('MISSING_FIELDS');
  });

  it('returns 400 when email is missing', async () => {
    const res = await POST(makeRequest({ name: 'Alice', password: 'password123' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('MISSING_FIELDS');
  });

  it('returns 400 when password is missing', async () => {
    const res = await POST(makeRequest({ name: 'Alice', email: 'a@b.com' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('MISSING_FIELDS');
  });

  it('returns 400 WEAK_PASSWORD when password has fewer than 8 chars', async () => {
    const res = await POST(makeRequest({ name: 'Alice', email: 'a@b.com', password: 'short' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('WEAK_PASSWORD');
  });

  it('returns 400 WEAK_PASSWORD for exactly 7 characters', async () => {
    const res = await POST(makeRequest({ name: 'Alice', email: 'a@b.com', password: '1234567' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('WEAK_PASSWORD');
  });

  // ── Conflict ──────────────────────────────────────────────────
  it('returns 409 EMAIL_TAKEN when email already exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(validUser as never);
    const res = await POST(makeRequest({ name: 'Alice', email: 'alice@example.com', password: 'password123' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('EMAIL_TAKEN');
  });

  // ── Rate limiting ─────────────────────────────────────────────
  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false });
    const res = await POST(makeRequest({ name: 'Alice', email: 'a@b.com', password: 'password123' }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('RATE_LIMIT');
  });

  // ── Success ───────────────────────────────────────────────────
  it('returns 201 with sanitized user data on success', async () => {
    const res = await POST(makeRequest({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'password123',
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe('alice@example.com');
    expect(body.role).toBe('CLIENT');
    expect(body).not.toHaveProperty('passwordHash');
  });

  it('normalises email to lowercase before saving', async () => {
    await POST(makeRequest({ name: 'Alice', email: 'ALICE@EXAMPLE.COM', password: 'password123' }));
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'alice@example.com' } }),
    );
  });

  it('creates a MEMBER loyalty grade for new user', async () => {
    await POST(makeRequest({ name: 'Alice', email: 'alice@example.com', password: 'password123' }));
    expect(prisma.loyaltyGrade.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ grade: 'MEMBER', isOverride: false }),
      }),
    );
  });

  it('sends welcome email to the new user', async () => {
    await POST(makeRequest({ name: 'Alice', email: 'alice@example.com', password: 'password123' }));
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alice@example.com' }),
    );
  });

  it('creates welcome notification for the new user', async () => {
    await POST(makeRequest({ name: 'Alice', email: 'alice@example.com', password: 'password123' }));
    expect(createWelcomeNotification).toHaveBeenCalledWith('user-1', 'Alice');
  });

  it('notifies admins and superadmins of new registration', async () => {
    const mockAdmin = { id: 'admin-1', email: 'admin@example.com' };
    vi.mocked(prisma.user.findMany).mockResolvedValue([mockAdmin] as never);

    await POST(makeRequest({ name: 'Alice', email: 'alice@example.com', password: 'password123' }));

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin@example.com' }),
    );
  });

  it('accepts optional phone and language fields', async () => {
    const res = await POST(makeRequest({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'password123',
      phone: '+212600000000',
      language: 'en',
    }));
    expect(res.status).toBe(201);
  });
});
