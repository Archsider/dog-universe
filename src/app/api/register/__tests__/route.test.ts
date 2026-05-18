/**
 * Tests for POST /api/register.
 * Focus: body validation, EMAIL_TAKEN handling, happy path (user + loyalty grade),
 * P2002 race condition.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    user: { create: vi.fn() },
    loyaltyGrade: { create: vi.fn() },
  };
  return {
    prisma: {
      user: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: unknown) =>
        typeof fn === 'function' ? (fn as (t: typeof tx) => unknown)(tx) : fn,
      ),
      _tx: tx,
    },
    logAction: vi.fn().mockResolvedValue(undefined),
    sendEmail: vi.fn().mockResolvedValue(undefined),
    getEmailTemplate: vi.fn().mockReturnValue({ subject: 'Welcome', html: '<p>hi</p>' }),
    notifyAdminsNewClient: vi.fn().mockResolvedValue(undefined),
    bcryptHash: vi.fn().mockResolvedValue('hashed-password'),
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/log', () => ({
  logAction: mocks.logAction,
  LOG_ACTIONS: { USER_REGISTER: 'USER_REGISTER' },
}));
vi.mock('@/lib/email', () => ({
  sendEmail: mocks.sendEmail,
  getEmailTemplate: mocks.getEmailTemplate,
}));
vi.mock('@/lib/notifications', () => ({
  notifyAdminsNewClient: mocks.notifyAdminsNewClient,
}));
vi.mock('bcryptjs', () => ({
  default: { hash: mocks.bcryptHash },
}));

import { POST } from '@/app/api/register/route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  firstName: 'Alice',
  lastName: 'Martin',
  email: 'alice@example.com',
  phone: '+212600000000',
  password: 'SuperSecret123!',
  language: 'fr',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.user.findUnique.mockResolvedValue(null);
  mocks.prisma._tx.user.create.mockResolvedValue({
    id: 'user-1',
    email: 'alice@example.com',
    name: 'Alice Martin',
    role: 'CLIENT',
    phone: '+212600000000',
    language: 'fr',
  });
  mocks.prisma._tx.loyaltyGrade.create.mockResolvedValue({
    id: 'lg-1',
    clientId: 'user-1',
    grade: 'BRONZE',
  });
});

describe('POST /api/register — validation', () => {
  it('rejects with 400 when body is malformed', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it('rejects with 400 when email is invalid', async () => {
    const res = await POST(makeReq({ ...validBody, email: 'not-an-email' }));
    expect(res.status).toBe(400);
  });

  it('rejects with 400 when password is too short', async () => {
    const res = await POST(makeReq({ ...validBody, password: 'short' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/register — happy path', () => {
  it('creates user with BCrypt-hashed password and BRONZE loyalty grade', async () => {
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({ id: 'user-1', email: 'alice@example.com', role: 'CLIENT' });
    expect(mocks.bcryptHash).toHaveBeenCalledWith('SuperSecret123!', 12);
    expect(mocks.prisma._tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'alice@example.com',
          passwordHash: 'hashed-password',
          role: 'CLIENT',
          language: 'fr',
        }),
      }),
    );
    expect(mocks.prisma._tx.loyaltyGrade.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: 'user-1',
        grade: 'BRONZE',
        isOverride: false,
      }),
    });
  });

  it('logs USER_REGISTER action with user id', async () => {
    await POST(makeReq(validBody));
    expect(mocks.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'USER_REGISTER',
        entityType: 'User',
      }),
    );
  });

  it('triggers admin notification and welcome email (non-blocking)', async () => {
    await POST(makeReq(validBody));
    expect(mocks.notifyAdminsNewClient).toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alice@example.com' }),
    );
  });
});

describe('POST /api/register — EMAIL_TAKEN', () => {
  it('returns 409 EMAIL_TAKEN when email already exists (pre-check)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValueOnce({ id: 'u-existing', email: 'alice@example.com' });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('EMAIL_TAKEN');
    // No bcrypt + create call after pre-check failure
    expect(mocks.bcryptHash).not.toHaveBeenCalled();
  });

  it('returns 409 EMAIL_TAKEN on P2002 race condition', async () => {
    mocks.prisma.$transaction.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('EMAIL_TAKEN');
  });

  it('returns 500 INTERNAL_ERROR on unexpected errors', async () => {
    mocks.prisma.$transaction.mockRejectedValueOnce(new Error('Unexpected DB error'));
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('INTERNAL_ERROR');
  });
});
