/**
 * Integration tests for the RGPD anonymization route handler
 * (src/app/api/user/anonymize/route.ts).
 *
 * No real DB, no real bcrypt rounds — everything is mocked.
 * We test the key behavioural contracts:
 *   1. Correct password → wipes PII and returns { success: true }
 *   2. Already-anonymized user → 200 { alreadyAnonymized: true }, no mutation
 *   3. Active bookings → 400 ACTIVE_BOOKING_EXISTS, no mutation
 *   4. tokenVersion is incremented on anonymization
 *   5. SUPERADMIN can anonymize another user without a password
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────
//
// vi.mock() factories are hoisted to the top of the file.  Any variable they
// close over must be created via vi.hoisted() so it exists before hoisting.
//
// The auth module (root-level auth.ts) imports next-auth, which in turn does
//   import { NextRequest } from "next/server"   ← no .js suffix
// That bare specifier fails under Vitest's ESM resolver.  We mock the module
// *before* it is ever imported so the problematic code path is never executed.

const { mockPrisma, mockTx, mockAuth, mockBcrypt } = vi.hoisted(() => {
  const mockTx = {
    user: { update: vi.fn().mockResolvedValue({}) },
    pet: { updateMany: vi.fn().mockResolvedValue({}) },
    notification: { deleteMany: vi.fn().mockResolvedValue({}) },
    passwordResetToken: { deleteMany: vi.fn().mockResolvedValue({}) },
    clientContract: { update: vi.fn().mockResolvedValue({}) },
  };

  const mockPrisma = {
    user: { findUnique: vi.fn() },
    booking: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
  };

  const mockAuth = vi.fn();

  const mockBcrypt = {
    compare: vi.fn(),
    hash: vi.fn().mockResolvedValue('hashed-anon-password'),
  };

  return { mockPrisma, mockTx, mockAuth, mockBcrypt };
});

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

// Mock next-auth itself to prevent it from executing its top-level side-effect
// that imports `next/server` (without .js suffix) — which fails under Vitest.
// This mock is resolved before auth.ts can load next-auth.
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({ handlers: {}, auth: mockAuth, signIn: vi.fn(), signOut: vi.fn() })),
}));

// Mock root-level auth.ts so the route handler receives our mockAuth directly.
vi.mock('../../../../../auth', () => ({ auth: mockAuth }));

// bcryptjs — fast mocked, no real hash rounds needed
vi.mock('bcryptjs', () => ({ default: mockBcrypt }));

// logAction — fire-and-forget side effect we don't assert on here
vi.mock('@/lib/log', () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { POST } from '@/app/api/user/anonymize/route';
import { NextRequest } from 'next/server';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/user/anonymize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const CLIENT_USER = {
  id: 'user-client-1',
  role: 'CLIENT',
  anonymizedAt: null,
  passwordHash: '$2b$10$fakeHashForTesting',
  contract: null,
};

const SUPERADMIN_SESSION = {
  user: { id: 'superadmin-1', role: 'SUPERADMIN' },
};

const CLIENT_SESSION = {
  user: { id: 'user-client-1', role: 'CLIENT' },
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no active bookings blocking the request
  mockPrisma.booking.findFirst.mockResolvedValue(null);
  // Default: target user is a regular CLIENT not yet anonymized
  mockPrisma.user.findUnique.mockResolvedValue(CLIENT_USER);
});

// ── Test 1: correct password → PII wiped ─────────────────────────────────────

describe('POST /api/user/anonymize — self-anonymization with correct password', () => {
  it('returns { success: true } and calls tx.user.update with anonymization payload', async () => {
    mockAuth.mockResolvedValue(CLIENT_SESSION);
    mockBcrypt.compare.mockResolvedValue(true);

    const res = await POST(makeRequest({ password: 'correct-password' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });

    // tx.user.update must be called with anonymization fields
    expect(mockTx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-client-1' },
        data: expect.objectContaining({
          name: 'Utilisateur supprimé',
          phone: null,
          anonymizedAt: expect.any(Date),
          tokenVersion: { increment: 1 },
        }),
      }),
    );

    // email must be replaced with the anonymous form
    const updateCall = mockTx.user.update.mock.calls[0][0] as {
      data: { email: string };
    };
    expect(updateCall.data.email).toMatch(/^deleted_user-client-1@doguniverse\.invalid$/);
  });
});

// ── Test 2: already anonymized → no-op ────────────────────────────────────────

describe('POST /api/user/anonymize — already anonymized', () => {
  it('returns { alreadyAnonymized: true } without mutating any data', async () => {
    mockAuth.mockResolvedValue(CLIENT_SESSION);
    mockPrisma.user.findUnique.mockResolvedValue({
      ...CLIENT_USER,
      anonymizedAt: new Date('2025-01-01'),
    });

    const res = await POST(makeRequest({ password: 'any' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, alreadyAnonymized: true });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockTx.user.update).not.toHaveBeenCalled();
  });
});

// ── Test 3: active CONFIRMED booking → ACTIVE_BOOKING_EXISTS error ────────────

describe('POST /api/user/anonymize — active booking blocks anonymization', () => {
  it('returns 400 ACTIVE_BOOKING_EXISTS when a CONFIRMED booking exists', async () => {
    mockAuth.mockResolvedValue(CLIENT_SESSION);
    mockBcrypt.compare.mockResolvedValue(true);

    const activeBooking = {
      id: 'booking-active',
      status: 'CONFIRMED',
      startDate: new Date('2026-06-01'),
    };
    mockPrisma.booking.findFirst.mockResolvedValue(activeBooking);

    const res = await POST(makeRequest({ password: 'correct-password' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('ACTIVE_BOOKING_EXISTS');
    expect(body.bookingId).toBe('booking-active');
    expect(body.status).toBe('CONFIRMED');
    // No mutation should have happened
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks on PENDING bookings as well', async () => {
    mockAuth.mockResolvedValue(CLIENT_SESSION);
    mockBcrypt.compare.mockResolvedValue(true);

    mockPrisma.booking.findFirst.mockResolvedValue({
      id: 'booking-pending',
      status: 'PENDING',
      startDate: new Date('2026-06-01'),
    });

    const res = await POST(makeRequest({ password: 'correct-password' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('ACTIVE_BOOKING_EXISTS');
  });
});

// ── Test 4: tokenVersion gets incremented ─────────────────────────────────────

describe('POST /api/user/anonymize — tokenVersion increment', () => {
  it('includes tokenVersion: { increment: 1 } in the update to invalidate sessions', async () => {
    mockAuth.mockResolvedValue(CLIENT_SESSION);
    mockBcrypt.compare.mockResolvedValue(true);

    await POST(makeRequest({ password: 'correct-password' }));

    const updateCall = mockTx.user.update.mock.calls[0][0] as {
      data: { tokenVersion: { increment: number } };
    };
    expect(updateCall.data.tokenVersion).toEqual({ increment: 1 });
  });
});

// ── Test 5: SUPERADMIN can anonymize another user without password ─────────────

describe('POST /api/user/anonymize — SUPERADMIN admin flow', () => {
  it('anonymizes another user when SUPERADMIN passes userId without a password', async () => {
    mockAuth.mockResolvedValue(SUPERADMIN_SESSION);

    // The target user is a CLIENT with id 'user-client-1'
    mockPrisma.user.findUnique.mockResolvedValue(CLIENT_USER);
    mockPrisma.booking.findFirst.mockResolvedValue(null);

    const res = await POST(makeRequest({ userId: 'user-client-1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });

    // bcrypt.compare should NOT have been called — admin flow skips password check
    expect(mockBcrypt.compare).not.toHaveBeenCalled();

    // The target user's row must be wiped
    expect(mockTx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-client-1' },
        data: expect.objectContaining({
          name: 'Utilisateur supprimé',
          anonymizedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('returns 403 when a non-SUPERADMIN tries to use the userId admin flow', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'admin-regular', role: 'ADMIN' },
    });

    const res = await POST(makeRequest({ userId: 'user-client-1' }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Forbidden');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
