import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We need to re-import the module under test with different env states.
// `vi.resetModules()` clears the module cache so each test can mutate
// `process.env.READ_DATABASE_URL` before importing fresh.

const ORIGINAL_READ_URL = process.env.READ_DATABASE_URL;

beforeEach(() => {
  vi.resetModules();
  delete process.env.READ_DATABASE_URL;
});

afterEach(() => {
  if (ORIGINAL_READ_URL === undefined) {
    delete process.env.READ_DATABASE_URL;
  } else {
    process.env.READ_DATABASE_URL = ORIGINAL_READ_URL;
  }
  vi.resetModules();
});

describe('prismaRead', () => {
  it('falls back to the write client when READ_DATABASE_URL is undefined', async () => {
    // Sanity — make absolutely sure the var is not set for this case.
    expect(process.env.READ_DATABASE_URL).toBeUndefined();

    const { prisma } = await import('../prisma');
    const { prismaRead } = await import('../prisma-read');

    // Reference equality: zero-cost fallback to the singleton.
    expect(prismaRead).toBe(prisma);
  });

  it('builds a distinct client instance when READ_DATABASE_URL is set', async () => {
    process.env.READ_DATABASE_URL =
      'postgresql://reader:secret@replica.example.com:5432/db?sslmode=require';

    const { prisma } = await import('../prisma');
    const { prismaRead } = await import('../prisma-read');

    // A different PrismaClient instance must be created — not the write singleton.
    expect(prismaRead).not.toBe(prisma);
    expect(prismaRead).toBeDefined();
    // Smoke check: the model accessors exist on the new client.
    expect(typeof (prismaRead as { user?: unknown }).user).toBe('object');
  });

  it('exports a value typed as PrismaClient regardless of env state', async () => {
    // No env var → fallback path
    const { prismaRead: fallback } = await import('../prisma-read');
    expect(fallback).toBeDefined();
    expect(typeof (fallback as { $connect?: unknown }).$connect).toBe('function');
  });
});
