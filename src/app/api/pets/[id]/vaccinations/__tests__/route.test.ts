/**
 * Tests for POST /api/pets/[id]/vaccinations (manual vaccination add).
 * Focus: auth gate, 404 pet missing, 403 not-owner-not-admin,
 * happy path creates Vaccination CONFIRMED.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    pet: { findFirst: vi.fn() },
    vaccination: { create: vi.fn() },
  },
}));

vi.mock('../../../../../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { POST } from '@/app/api/pets/[id]/vaccinations/route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/pets/pet1/vaccinations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const clientSession = { user: { id: 'client1', role: 'CLIENT' } };
const adminSession = { user: { id: 'admin1', role: 'ADMIN' } };
const otherClient = { user: { id: 'client2', role: 'CLIENT' } };

const validVacc = {
  vaccineType: 'Rabies',
  date: '2026-01-15',
};

describe('POST /api/pets/[id]/vaccinations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.vaccination.create.mockResolvedValue({
      id: 'vacc1',
      petId: 'pet1',
      vaccineType: 'Rabies',
      status: 'CONFIRMED',
    });
  });

  it('401 without session', async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await POST(makeReq(validVacc), { params: Promise.resolve({ id: 'pet1' }) });
    expect(res.status).toBe(401);
  });

  it('404 when pet not found', async () => {
    mocks.auth.mockResolvedValue(clientSession);
    mocks.prisma.pet.findFirst.mockResolvedValue(null);
    const res = await POST(makeReq(validVacc), { params: Promise.resolve({ id: 'missing' }) });
    expect(res.status).toBe(404);
  });

  it('403 when CLIENT is not the owner of the pet', async () => {
    mocks.auth.mockResolvedValue(otherClient);
    mocks.prisma.pet.findFirst.mockResolvedValue({ id: 'pet1', ownerId: 'client1' });
    const res = await POST(makeReq(validVacc), { params: Promise.resolve({ id: 'pet1' }) });
    expect(res.status).toBe(403);
  });

  it('happy path: owner creates vaccination CONFIRMED', async () => {
    mocks.auth.mockResolvedValue(clientSession);
    mocks.prisma.pet.findFirst.mockResolvedValue({ id: 'pet1', ownerId: 'client1' });

    const res = await POST(makeReq(validVacc), { params: Promise.resolve({ id: 'pet1' }) });
    expect(res.status).toBe(201);

    expect(mocks.prisma.vaccination.create).toHaveBeenCalledTimes(1);
    const args = mocks.prisma.vaccination.create.mock.calls[0]![0];
    expect(args.data.petId).toBe('pet1');
    expect(args.data.vaccineType).toBe('Rabies');
    expect(args.data.status).toBe('CONFIRMED');
    expect(args.data.date).toBeInstanceOf(Date);
  });

  it('ADMIN can create vaccination on any pet', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.pet.findFirst.mockResolvedValue({ id: 'pet1', ownerId: 'client1' });

    const res = await POST(makeReq(validVacc), { params: Promise.resolve({ id: 'pet1' }) });
    expect(res.status).toBe(201);
  });

  it('SUPERADMIN can create vaccination on any pet', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'super1', role: 'SUPERADMIN' } });
    mocks.prisma.pet.findFirst.mockResolvedValue({ id: 'pet1', ownerId: 'client1' });

    const res = await POST(makeReq(validVacc), { params: Promise.resolve({ id: 'pet1' }) });
    expect(res.status).toBe(201);
  });

  it('400 when vaccineType is missing (Zod)', async () => {
    mocks.auth.mockResolvedValue(clientSession);
    mocks.prisma.pet.findFirst.mockResolvedValue({ id: 'pet1', ownerId: 'client1' });

    const res = await POST(makeReq({ date: '2026-01-15' }), { params: Promise.resolve({ id: 'pet1' }) });
    expect(res.status).toBe(400);
  });

  it('400 when date is missing (Zod)', async () => {
    mocks.auth.mockResolvedValue(clientSession);
    mocks.prisma.pet.findFirst.mockResolvedValue({ id: 'pet1', ownerId: 'client1' });

    const res = await POST(makeReq({ vaccineType: 'Rabies' }), { params: Promise.resolve({ id: 'pet1' }) });
    expect(res.status).toBe(400);
  });

  it('500 on Prisma failure', async () => {
    mocks.auth.mockResolvedValue(clientSession);
    mocks.prisma.pet.findFirst.mockResolvedValue({ id: 'pet1', ownerId: 'client1' });
    mocks.prisma.vaccination.create.mockRejectedValue(new Error('boom'));

    const res = await POST(makeReq(validVacc), { params: Promise.resolve({ id: 'pet1' }) });
    expect(res.status).toBe(500);
  });
});
