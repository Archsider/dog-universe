import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/cron-lock', () => ({ acquireCronLock: vi.fn(async () => true) }));
vi.mock('@/lib/observability', () => ({ markCronRun: vi.fn(async () => undefined) }));

const mocks = vi.hoisted(() => ({
  createNotification: vi.fn(
    async (_data: { userId: string; type: string; metadata?: Record<string, string> }) => undefined,
  ),
  enqueueEmail: vi.fn(async (_email: { to: string }, _jobId?: string) => undefined),
  getEmailTemplate: vi.fn(() => ({ subject: 'S', html: '<p>H</p>' })),
  prisma: {
    vaccination: { findMany: vi.fn() },
    notification: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/notifications', () => ({ createNotification: mocks.createNotification }));
vi.mock('@/lib/queues', () => ({ enqueueEmail: mocks.enqueueEmail }));
vi.mock('@/lib/email', () => ({ getEmailTemplate: mocks.getEmailTemplate }));

import * as mod from '@/app/api/cron/vaccine-reminders/route';

const ORIGINAL_SECRET = process.env.CRON_SECRET;

function req() {
  return new Request('http://test/api/cron/vaccine-reminders', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  }) as unknown as Request;
}

function vacc(over: Record<string, unknown> = {}) {
  return {
    id: 'vacc1',
    vaccineType: 'Rage',
    nextDueDate: new Date('2026-06-18T12:00:00Z'),
    pet: {
      id: 'pet1',
      name: 'Maxou',
      owner: { id: 'owner1', name: 'Mehdi Bennani', email: 'm@x.com', language: 'fr' },
    },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'test-secret';
  mocks.prisma.vaccination.findMany.mockResolvedValue([vacc()]);
  mocks.prisma.notification.findMany.mockResolvedValue([]); // no prior reminders
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
});

describe('GET /api/cron/vaccine-reminders', () => {
  it('401 without the cron secret', async () => {
    const res = await mod.GET(new Request('http://test/api/cron/vaccine-reminders') as unknown as Request);
    expect(res.status).toBe(401);
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it('notifies the owner (in-app + email) for a vaccine due in the window', async () => {
    const res = await mod.GET(req());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.sent).toBe(1);
    expect(mocks.createNotification).toHaveBeenCalledTimes(1);
    const notif = mocks.createNotification.mock.calls[0][0];
    expect(notif.type).toBe('VACCINE_REMINDER');
    expect(notif.userId).toBe('owner1');
    expect(notif.metadata).toMatchObject({ vaccinationId: 'vacc1', petId: 'pet1' });
    expect(mocks.enqueueEmail).toHaveBeenCalledTimes(1);
    const [emailArg, jobId] = mocks.enqueueEmail.mock.calls[0];
    expect(emailArg.to).toBe('m@x.com');
    expect(jobId).toBe('vaccine-reminder:vacc1');
  });

  it('skips a vaccination already reminded within the dedup window', async () => {
    mocks.prisma.notification.findMany.mockResolvedValue([
      { metadata: JSON.stringify({ vaccinationId: 'vacc1', petId: 'pet1' }) },
    ]);
    const res = await mod.GET(req());
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(json.skipped).toBe(1);
    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.enqueueEmail).not.toHaveBeenCalled();
  });

  it('still sends the in-app notification when the owner has no email', async () => {
    mocks.prisma.vaccination.findMany.mockResolvedValue([
      vacc({ pet: { id: 'pet1', name: 'Maxou', owner: { id: 'owner1', name: 'Mehdi', email: null, language: 'fr' } } }),
    ]);
    const res = await mod.GET(req());
    const json = await res.json();
    expect(json.sent).toBe(1);
    expect(mocks.createNotification).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueEmail).not.toHaveBeenCalled();
  });
});
