/**
 * Tests for POST /api/pets (pet creation by client).
 * Focus: auth gate, dateOfBirth required, idempotent re-use of existing pet,
 * happy path creates Pet + audit log.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    pet: { findFirst: vi.fn(), create: vi.fn() },
  },
  logAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/log', () => ({
  logAction: mocks.logAction,
  LOG_ACTIONS: { PET_CREATED: 'PET_CREATED' },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { POST } from '@/app/api/pets/route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/pets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const clientSession = { user: { id: 'client1', role: 'CLIENT' } };

const validPet = {
  name: 'Rex',
  species: 'DOG',
  dateOfBirth: '2020-01-15',
};

describe('POST /api/pets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.pet.findFirst.mockResolvedValue(null);
    mocks.prisma.pet.create.mockResolvedValue({
      id: 'pet1',
      name: 'Rex',
      species: 'DOG',
      ownerId: 'client1',
    });
  });

  it('401 without session', async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await POST(makeReq(validPet));
    expect(res.status).toBe(401);
  });

  it('400 when dateOfBirth is missing (required field)', async () => {
    mocks.auth.mockResolvedValue(clientSession);
    const body = { name: 'Rex', species: 'DOG' };
    const res = await POST(makeReq(body));
    expect(res.status).toBe(400);
  });

  it('400 when name is missing', async () => {
    mocks.auth.mockResolvedValue(clientSession);
    const res = await POST(makeReq({ species: 'DOG', dateOfBirth: '2020-01-15' }));
    expect(res.status).toBe(400);
  });

  it('400 when species is invalid', async () => {
    mocks.auth.mockResolvedValue(clientSession);
    const res = await POST(makeReq({ ...validPet, species: 'HORSE' }));
    expect(res.status).toBe(400);
  });

  it('happy path: creates Pet with clientId from session', async () => {
    mocks.auth.mockResolvedValue(clientSession);
    const res = await POST(makeReq(validPet));
    expect(res.status).toBe(201);

    expect(mocks.prisma.pet.create).toHaveBeenCalledTimes(1);
    const args = mocks.prisma.pet.create.mock.calls[0]![0];
    expect(args.data.ownerId).toBe('client1');
    expect(args.data.name).toBe('Rex');
    expect(args.data.species).toBe('DOG');
    expect(args.data.dateOfBirth).toBeInstanceOf(Date);

    // Audit log written
    expect(mocks.logAction).toHaveBeenCalledTimes(1);
    expect(mocks.logAction.mock.calls[0]![0]).toMatchObject({
      action: 'PET_CREATED',
      entityType: 'Pet',
      entityId: 'pet1',
    });
  });

  it('idempotent: returns existing pet with same (owner, species, name)', async () => {
    mocks.auth.mockResolvedValue(clientSession);
    const existing = { id: 'pet99', name: 'Rex', species: 'DOG', ownerId: 'client1' };
    mocks.prisma.pet.findFirst.mockResolvedValue(existing);

    const res = await POST(makeReq(validPet));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe('pet99');

    // Should NOT call create
    expect(mocks.prisma.pet.create).not.toHaveBeenCalled();
  });

  it('trims name before persisting', async () => {
    mocks.auth.mockResolvedValue(clientSession);
    await POST(makeReq({ ...validPet, name: '  Rex  ' }));
    const args = mocks.prisma.pet.create.mock.calls[0]![0];
    expect(args.data.name).toBe('Rex');
  });

  it('500 on Prisma failure', async () => {
    mocks.auth.mockResolvedValue(clientSession);
    mocks.prisma.pet.create.mockRejectedValue(new Error('boom'));
    const res = await POST(makeReq(validPet));
    expect(res.status).toBe(500);
  });
});
