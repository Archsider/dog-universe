import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getCapacityLimits: vi.fn(),
  countOverlappingPets: vi.fn(),
}));

vi.mock('../../../../../../auth', () => ({ auth: mocks.auth }));
// capacity-alternatives.ts pulls countOverlappingPets from here too, so this
// single mock drives both the requestedFits check and the alternatives search.
vi.mock('@/lib/capacity', () => ({
  getCapacityLimits: mocks.getCapacityLimits,
  countOverlappingPets: mocks.countOverlappingPets,
}));

import { GET } from '@/app/api/availability/alternatives/route';

function req(qs: string) {
  return new NextRequest(`http://test/api/availability/alternatives?${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'u1', role: 'CLIENT' } });
  mocks.getCapacityLimits.mockResolvedValue({ dogs: 5, cats: 3 });
  // Default: everything empty (capacity available).
  mocks.countOverlappingPets.mockResolvedValue(0);
});

describe('GET /api/availability/alternatives', () => {
  it('401 without a session', async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await GET(req('start=2026-06-10&end=2026-06-13&dogs=2'));
    expect(res.status).toBe(401);
  });

  it('400 on bad dates / pet counts / empty request', async () => {
    expect((await GET(req('start=nope&end=2026-06-13&dogs=2'))).status).toBe(400);
    expect((await GET(req('start=2026-06-10&end=2026-06-13&dogs=-1'))).status).toBe(400);
    expect((await GET(req('start=2026-06-10&end=2026-06-13&dogs=0&cats=0'))).status).toBe(400);
    expect((await GET(req('start=2026-06-13&end=2026-06-10&dogs=2'))).status).toBe(400); // end<=start
  });

  it('reports requestedFits=true with no alternatives when there is room', async () => {
    const res = await GET(req('start=2026-06-10&end=2026-06-13&dogs=2'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.requestedFits).toBe(true);
    expect(json.nights).toBe(3);
    expect(json.alternatives).toEqual([]);
  });

  it('returns the nearest fitting window when the requested dates are full', async () => {
    // Day 10 (requested start) is full for dogs; every other day is free.
    mocks.countOverlappingPets.mockImplementation(async (_species: string, window: { startDate: Date }) =>
      window.startDate.getUTCDate() === 10 ? 5 : 0,
    );
    const res = await GET(req('start=2026-06-10&end=2026-06-13&dogs=2'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.requestedFits).toBe(false);
    expect(json.alternatives.length).toBeGreaterThan(0);
    expect(json.alternatives[0]).toEqual({ startYmd: '2026-06-11', endYmd: '2026-06-14', offsetDays: 1 });
  });
});
