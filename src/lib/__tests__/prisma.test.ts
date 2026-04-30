// Tests for src/lib/prisma.ts singleton and initialization logic.
// Uses vi.resetModules() + dynamic imports so each test gets a fresh module
// evaluation — necessary because prisma.ts has module-level singleton state.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock PrismaClient so no real DB connection is attempted.
const mockPrismaInstance = vi.hoisted(() => ({
  user: {},
  pet: {},
  booking: {},
  setting: {},
}));

const MockPrismaClient = vi.hoisted(() => vi.fn(function() { return mockPrismaInstance; }));

vi.mock('@prisma/client', () => ({
  PrismaClient: MockPrismaClient,
}));

beforeEach(() => {
  vi.resetModules();
  // Clear any cached prisma instance from globalThis between tests
  (globalThis as Record<string, unknown>).prisma = undefined;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Basic export
// ---------------------------------------------------------------------------
describe('prisma singleton — export', () => {
  it('exports a prisma object', async () => {
    const { prisma } = await import('../prisma');
    expect(prisma).toBeDefined();
    expect(prisma).not.toBeNull();
  });

  it('creates a PrismaClient instance', async () => {
    const { prisma } = await import('../prisma');
    expect(prisma).toBe(mockPrismaInstance);
    expect(MockPrismaClient).toHaveBeenCalledOnce();
  });

  it('does not call $extends — extension was reverted to keep Edge Runtime safe', async () => {
    await import('../prisma');
    // The mock instance does not have $extends called on it
    expect(MockPrismaClient).toHaveBeenCalledOnce();
    // prisma.ts no longer calls baseClient.$extends() at all
  });
});

// ---------------------------------------------------------------------------
// Singleton — globalThis caching
// ---------------------------------------------------------------------------
describe('prisma singleton — globalThis cache', () => {
  it('stores instance in globalThis in non-production', async () => {
    expect((globalThis as Record<string, unknown>).prisma).toBeUndefined();
    await import('../prisma');
    expect((globalThis as Record<string, unknown>).prisma).toBe(mockPrismaInstance);
  });

  it('reuses cached globalThis instance on subsequent imports (no duplicate PrismaClient)', async () => {
    // First import stores instance
    const { prisma: p1 } = await import('../prisma');
    // Second import reuses cached module (vitest module cache, not resetModules was called only in beforeEach)
    const { prisma: p2 } = await import('../prisma');
    expect(p1).toBe(p2);
    // PrismaClient constructor called only once per module evaluation
    expect(MockPrismaClient).toHaveBeenCalledOnce();
  });

  it('does not create a new PrismaClient when globalThis has a valid cached instance', async () => {
    // Pre-populate globalThis with a valid instance (has 'setting' model)
    const existingClient = { user: {}, pet: {}, booking: {}, setting: {} };
    (globalThis as Record<string, unknown>).prisma = existingClient;

    const { prisma } = await import('../prisma');
    expect(prisma).toBe(existingClient);
    expect(MockPrismaClient).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Stale cache reset — missing models guard
// ---------------------------------------------------------------------------
describe('prisma singleton — stale instance reset', () => {
  it('resets globalThis.prisma when the cached instance is missing the setting model', async () => {
    // Simulate a stale client (e.g. after prisma generate without server restart)
    const staleClient = { user: {}, pet: {}, booking: {} }; // no 'setting'
    (globalThis as Record<string, unknown>).prisma = staleClient;

    const { prisma } = await import('../prisma');
    // Should have been replaced by a fresh PrismaClient
    expect(prisma).toBe(mockPrismaInstance);
    expect(MockPrismaClient).toHaveBeenCalledOnce();
  });

  it('keeps globalThis.prisma when the cached instance has the setting model', async () => {
    const validClient = { user: {}, pet: {}, booking: {}, setting: {} };
    (globalThis as Record<string, unknown>).prisma = validClient;

    const { prisma } = await import('../prisma');
    expect(prisma).toBe(validClient);
    expect(MockPrismaClient).not.toHaveBeenCalled();
  });
});
