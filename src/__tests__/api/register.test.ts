/**
 * Unit tests — POST /api/register
 *
 * Mocks: prisma, bcryptjs, sendEmail, notifyAdminsNewClient, logAction
 * No real DB connection — all collaborators are stubbed via vi.mock().
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const prismaTx = {
    user: { create: vi.fn() },
    loyaltyGrade: { create: vi.fn() },
  };

  return {
    prisma: {
      user: { findUnique: vi.fn(), create: vi.fn() },
      $transaction: vi.fn(async (fn: any) => {
        if (typeof fn === 'function') return fn(prismaTx);
        return fn;
      }),
    },
    prismaTx,
    bcryptHash: vi.fn().mockResolvedValue('hashed-password-xyz'),
    sendEmail: vi.fn().mockResolvedValue(undefined),
    getEmailTemplate: vi.fn().mockReturnValue({ subject: 'Welcome', html: '<p/>' }),
    logAction: vi.fn().mockResolvedValue(undefined),
    notifyAdminsNewClient: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));

vi.mock('bcryptjs', () => ({
  default: {
    hash: mocks.bcryptHash,
    compare: vi.fn(),
  },
  hash: mocks.bcryptHash,
  compare: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: mocks.sendEmail,
  getEmailTemplate: mocks.getEmailTemplate,
}));

vi.mock('@/lib/log', () => ({
  logAction: mocks.logAction,
  LOG_ACTIONS: {
    USER_REGISTER: 'USER_REGISTER',
  },
}));

vi.mock('@/lib/notifications', () => ({
  notifyAdminsNewClient: mocks.notifyAdminsNewClient,
  createBookingConfirmationNotification: vi.fn(),
  createBookingWaitlistedNotification: vi.fn(),
  createBookingValidationNotification: vi.fn(),
  createBookingRefusalNotification: vi.fn(),
  createBookingInProgressNotification: vi.fn(),
  createBookingCompletedNotification: vi.fn(),
  createBookingNoShowNotification: vi.fn(),
  notifyAdminsNewBooking: vi.fn(),
  promoteWaitlistedBooking: vi.fn(),
}));

// Import handler AFTER mocks
import { POST } from '@/app/api/register/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: unknown): Request {
  return new Request('https://example.com/api/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: 'Alice Dupont',
  email: 'alice@example.com',
  password: 'SecurePassword123',
  phone: '+212600000001',
  language: 'fr',
};

const createdUser = {
  id: 'user-abc123',
  name: 'Alice Dupont',
  email: 'alice@example.com',
  role: 'CLIENT',
  language: 'fr',
  phone: '+212600000001',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: email not already taken
  mocks.prisma.user.findUnique.mockResolvedValue(null);
  // Default: transaction creates user + loyalty grade
  mocks.prismaTx.user.create.mockResolvedValue(createdUser);
  mocks.prismaTx.loyaltyGrade.create.mockResolvedValue({ id: 'grade-1' });
  mocks.prisma.$transaction.mockImplementation(async (fn: any) => {
    if (typeof fn === 'function') return fn(mocks.prismaTx);
    return fn;
  });
});

// ===========================================================================
// Validation (Zod)
// ===========================================================================
describe('POST /api/register — validation', () => {
  it('returns 400 on missing required fields (empty body)', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 when name has only one word (first AND last required)', async () => {
    const res = await POST(makeRequest({ ...validBody, name: 'Alice' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 when email is invalid', async () => {
    const res = await POST(makeRequest({ ...validBody, email: 'not-an-email' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 when password is too short (< 8 chars)', async () => {
    const res = await POST(makeRequest({ ...validBody, password: 'short' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 when name is missing', async () => {
    const { name: _name, ...bodyWithoutName } = validBody;
    const res = await POST(makeRequest(bodyWithoutName));
    expect(res.status).toBe(400);
  });

  it('returns 400 when email is missing', async () => {
    const { email: _email, ...bodyWithoutEmail } = validBody;
    const res = await POST(makeRequest(bodyWithoutEmail));
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const { password: _password, ...bodyWithoutPassword } = validBody;
    const res = await POST(makeRequest(bodyWithoutPassword));
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// Email taken
// ===========================================================================
describe('POST /api/register — duplicate email', () => {
  it('returns 409 EMAIL_TAKEN when email already exists (findUnique)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'existing-user', email: 'alice@example.com' });

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('EMAIL_TAKEN');
  });

  it('returns 409 EMAIL_TAKEN on Prisma P2002 race condition', async () => {
    // findUnique returns null (passes guard), but $transaction throws P2002
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    const p2002Error = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    mocks.prisma.$transaction.mockRejectedValueOnce(p2002Error);

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('EMAIL_TAKEN');
  });
});

// ===========================================================================
// Successful registration
// ===========================================================================
describe('POST /api/register — success', () => {
  it('returns 201 with user fields on valid input', async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe('user-abc123');
    expect(json.email).toBe('alice@example.com');
    expect(json.name).toBe('Alice Dupont');
    expect(json.role).toBe('CLIENT');
  });

  it('never exposes passwordHash in response', async () => {
    const res = await POST(makeRequest(validBody));
    const json = await res.json();
    expect(json).not.toHaveProperty('passwordHash');
    expect(json).not.toHaveProperty('password');
  });

  it('stores hashed password, not plaintext', async () => {
    await POST(makeRequest(validBody));
    // bcrypt.hash must be called with the plaintext password
    expect(mocks.bcryptHash).toHaveBeenCalledWith('SecurePassword123', 12);
    // tx.user.create must receive passwordHash, not the plain password
    expect(mocks.prismaTx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordHash: 'hashed-password-xyz',
        }),
      }),
    );
    expect(mocks.prismaTx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          password: expect.anything(),
        }),
      }),
    );
  });

  it('creates a LoyaltyGrade BRONZE record alongside the user', async () => {
    await POST(makeRequest(validBody));
    expect(mocks.prismaTx.loyaltyGrade.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'user-abc123',
          grade: 'BRONZE',
          isOverride: false,
        }),
      }),
    );
  });

  it('logs the registration action', async () => {
    await POST(makeRequest(validBody));
    expect(mocks.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-abc123',
        action: 'USER_REGISTER',
      }),
    );
  });

  it('sends a welcome email (non-blocking, best effort)', async () => {
    await POST(makeRequest(validBody));
    // sendEmail is fire-and-forget (.catch(() => {})) — we just verify it was called
    expect(mocks.getEmailTemplate).toHaveBeenCalledWith(
      'welcome',
      expect.objectContaining({ clientName: 'Alice Dupont' }),
      'fr',
    );
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alice@example.com' }),
    );
  });

  it('notifies admins of new client registration', async () => {
    await POST(makeRequest(validBody));
    expect(mocks.notifyAdminsNewClient).toHaveBeenCalledWith(
      'Alice Dupont',
      'alice@example.com',
      '+212600000001',
      'user-abc123',
    );
  });

  it('phone is optional — accepts registration without phone', async () => {
    const { phone: _phone, ...bodyWithoutPhone } = validBody;
    mocks.prismaTx.user.create.mockResolvedValue({ ...createdUser, phone: null });

    const res = await POST(makeRequest(bodyWithoutPhone));
    expect(res.status).toBe(201);
  });
});
