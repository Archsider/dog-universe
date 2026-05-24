import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/cron-lock', () => ({ acquireCronLock: vi.fn(async () => true) }));
vi.mock('@/lib/observability', () => ({ markCronRun: vi.fn(async () => undefined) }));

const mocks = vi.hoisted(() => ({
  loadTodaySnapshot: vi.fn(),
  sendEmailNow: vi.fn(),
  getCapacityLimits: vi.fn(),
  loadBirthdays: vi.fn(),
  loadVaccines: vi.fn(),
  prisma: {
    invoice: { aggregate: vi.fn() },
    booking: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/app/[locale]/admin/reservations/_lib/today-queries', () => ({
  loadTodaySnapshot: mocks.loadTodaySnapshot,
}));
vi.mock('@/app/[locale]/admin/dashboard/_lib/loaders/birthdays', () => ({
  loadBirthdays: mocks.loadBirthdays,
}));
vi.mock('@/app/[locale]/admin/dashboard/_lib/loaders/vaccines', () => ({
  loadVaccines: mocks.loadVaccines,
}));
vi.mock('@/lib/notify-now', () => ({ sendEmailNow: mocks.sendEmailNow }));
vi.mock('@/lib/capacity', () => ({ getCapacityLimits: mocks.getCapacityLimits }));

import * as mod from '@/app/api/cron/morning-digest/route';

const ORIGINAL_SECRET = process.env.CRON_SECRET;

function req() {
  return new Request('http://test/api/cron/morning-digest', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  }) as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'test-secret';
  mocks.loadTodaySnapshot.mockResolvedValue({
    date: '2026-05-23',
    kpis: { arrivals: 1, departures: 1, present: 5, pending: 2 },
    arrivals: [{ client: { name: 'Alice' }, arrivalTime: '10:00' }],
    departures: [{ client: { name: 'Bob' }, arrivalTime: null }],
    currentStays: [],
    pending: [],
    upcomingWeek: [],
  });
  mocks.getCapacityLimits.mockResolvedValue({ dogs: 20, cats: 10 });
  mocks.prisma.invoice.aggregate.mockResolvedValue({ _count: 3, _sum: { amount: 1000, paidAmount: 200 } });
  mocks.prisma.booking.findMany.mockResolvedValue([
    { bookingPets: [{ pet: { species: 'DOG' } }, { pet: { species: 'CAT' } }] },
  ]);
  mocks.prisma.user.findMany.mockResolvedValue([{ email: 'admin@x.com', language: 'fr' }]);
  mocks.loadBirthdays.mockResolvedValue([
    { petId: 'p1', petName: 'Maxou', ownerName: 'Mehdi', birthdayYmd: '2026-05-24' },
  ]);
  mocks.loadVaccines.mockResolvedValue([
    { petName: 'Rexy', ownerName: 'Sara', vaccineType: 'Rage', expiryYmd: '2026-06-10' },
  ]);
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
});

describe('GET /api/cron/morning-digest', () => {
  it('401 without the cron secret', async () => {
    const res = await mod.GET(new Request('http://test/api/cron/morning-digest') as unknown as Request);
    expect(res.status).toBe(401);
    expect(mocks.sendEmailNow).not.toHaveBeenCalled();
  });

  it('emails each admin a morning_digest and reports counts', async () => {
    const res = await mod.GET(req());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.recipients).toBe(1);
    expect(json.unpaidCount).toBe(3);
    expect(mocks.sendEmailNow).toHaveBeenCalledTimes(1);
    const arg = mocks.sendEmailNow.mock.calls[0][0];
    expect(arg.to).toBe('admin@x.com');
    expect(arg.subject).toContain('Dog Universe');
    // occupancy + arrivals are rendered into the HTML
    expect(arg.html).toContain('Alice');
    // enriched sections: birthdays + vaccines
    expect(json.birthdays).toBe(1);
    expect(json.vaccines).toBe(1);
    expect(arg.html).toContain('Maxou');
    expect(arg.html).toContain('Rexy');
    expect(arg.html).toContain('Rage');
  });

  it('omits the birthday/vaccine lines when both are empty', async () => {
    mocks.loadBirthdays.mockResolvedValue([]);
    mocks.loadVaccines.mockResolvedValue([]);
    const res = await mod.GET(req());
    const arg = mocks.sendEmailNow.mock.calls[0][0];
    expect(arg.html).not.toContain('Anniversaires');
    expect(arg.html).not.toContain('Vaccins');
    const json = await res.json();
    expect(json.birthdays).toBe(0);
    expect(json.vaccines).toBe(0);
  });

  it('sends nothing when there are no admin recipients', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([]);
    const res = await mod.GET(req());
    const json = await res.json();
    expect(json.recipients).toBe(0);
    expect(mocks.sendEmailNow).not.toHaveBeenCalled();
  });
});
