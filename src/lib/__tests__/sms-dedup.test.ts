import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  findFirst: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    smsLog: {
      findUnique: mocks.findUnique,
      create: mocks.create,
      update: mocks.update,
      findFirst: mocks.findFirst,
      upsert: mocks.upsert,
    },
  },
}));

import {
  tryReserveSmsSend,
  markSmsSent,
  isSmsDedup,
  recordSmsSent,
  smsDedupHash,
} from '@/lib/sms-dedup';

// Helper: build the Prisma "Unique constraint" error shape so the
// reservation function recognises the lost-race signal.
function p2002() {
  const e = new Error('Unique constraint failed') as Error & { code?: string };
  e.code = 'P2002';
  return e;
}

describe('smsDedupHash', () => {
  it('is deterministic for the same (phone, message)', () => {
    const h1 = smsDedupHash('+212600000000', 'hello');
    const h2 = smsDedupHash('+212600000000', 'hello');
    expect(h1).toBe(h2);
  });

  it('differs across phones and messages', () => {
    expect(smsDedupHash('+212600000000', 'a')).not.toBe(smsDedupHash('+212600000001', 'a'));
    expect(smsDedupHash('+212600000000', 'a')).not.toBe(smsDedupHash('+212600000000', 'b'));
  });
});

describe('tryReserveSmsSend — atomic INSERT-first dedup', () => {
  beforeEach(() => {
    mocks.findUnique.mockReset();
    mocks.create.mockReset();
    mocks.update.mockReset();
  });

  it('first caller succeeds: row does not exist, INSERT wins', async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    mocks.create.mockResolvedValueOnce({ id: 'log1' });
    const ok = await tryReserveSmsSend('ADMIN', 'Paiement reçu');
    expect(ok).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('second concurrent caller loses the race (P2002) → returns false', async () => {
    // Both callers see no row at findUnique time; one creates, the other
    // hits the unique constraint. The loser must bail.
    mocks.findUnique.mockResolvedValueOnce(null);
    mocks.create.mockRejectedValueOnce(p2002());
    const ok = await tryReserveSmsSend('ADMIN', 'Paiement reçu');
    expect(ok).toBe(false);
  });

  it('row exists and is fresh (within dedup window) → returns false', async () => {
    mocks.findUnique.mockResolvedValueOnce({ sentAt: new Date() });
    const ok = await tryReserveSmsSend('+212600000000', 'hi');
    expect(ok).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('row exists but is stale (outside the 24h window) → UPDATE and proceed', async () => {
    const oldDate = new Date(Date.now() - 48 * 3_600_000); // 48h ago
    mocks.findUnique.mockResolvedValueOnce({ sentAt: oldDate });
    mocks.update.mockResolvedValueOnce({ id: 'log1' });
    const ok = await tryReserveSmsSend('+212600000000', 'hi');
    expect(ok).toBe(true);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('fail-open on unexpected DB error (returns true, allows send)', async () => {
    // Simulate the migration not being applied: every Prisma call throws
    // with a non-P2002 code. We MUST allow the send to go through rather
    // than silently swallow the notification.
    const dbDown = new Error('relation "SmsLog" does not exist');
    mocks.findUnique.mockRejectedValueOnce(dbDown);
    const ok = await tryReserveSmsSend('ADMIN', 'critical alert');
    expect(ok).toBe(true);
  });

  it('non-P2002 create errors bubble up via fail-open', async () => {
    // A connection drop mid-INSERT is treated like the DB-down case: we
    // can't be sure whether the row was created, so we fail open to
    // preserve delivery. The duplicate risk in this rare path is
    // acceptable; the silenced-notification risk is not.
    mocks.findUnique.mockResolvedValueOnce(null);
    mocks.create.mockRejectedValueOnce(new Error('connection terminated'));
    const ok = await tryReserveSmsSend('ADMIN', 'critical alert');
    expect(ok).toBe(true);
  });
});

describe('markSmsSent', () => {
  beforeEach(() => {
    mocks.update.mockReset();
  });

  it('flips status to SENT on the matching row', async () => {
    mocks.update.mockResolvedValueOnce({ id: 'log1' });
    await markSmsSent('+212600000000', 'hi');
    expect(mocks.update).toHaveBeenCalledTimes(1);
    const arg = mocks.update.mock.calls[0][0];
    expect(arg.data.status).toBe('SENT');
  });

  it('swallows errors silently (non-blocking)', async () => {
    mocks.update.mockRejectedValueOnce(new Error('row gone'));
    await expect(markSmsSent('+212600000000', 'hi')).resolves.toBeUndefined();
  });
});

// The legacy helpers are kept for the cron-batch path (BullMQ worker), which
// has its own at-most-once mechanism upstream of the SmsLog check. These
// short tests confirm we didn't regress them while introducing the atomic
// reservation flow.
describe('isSmsDedup (legacy read-then-write, used by worker)', () => {
  beforeEach(() => {
    mocks.findFirst.mockReset();
  });

  it('returns true when a fresh log row matches', async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: 'log1' });
    expect(await isSmsDedup('ADMIN', 'hello')).toBe(true);
  });

  it('returns false when no fresh row matches', async () => {
    mocks.findFirst.mockResolvedValueOnce(null);
    expect(await isSmsDedup('ADMIN', 'hello')).toBe(false);
  });

  it('fail-opens on DB error (returns false → allow send)', async () => {
    mocks.findFirst.mockRejectedValueOnce(new Error('relation missing'));
    expect(await isSmsDedup('ADMIN', 'hello')).toBe(false);
  });
});

describe('recordSmsSent (legacy upsert)', () => {
  beforeEach(() => {
    mocks.upsert.mockReset();
  });

  it('upserts and never throws', async () => {
    mocks.upsert.mockResolvedValueOnce({ id: 'log1' });
    await expect(recordSmsSent('ADMIN', 'hi')).resolves.toBeUndefined();
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it('swallows DB errors', async () => {
    mocks.upsert.mockRejectedValueOnce(new Error('boom'));
    await expect(recordSmsSent('ADMIN', 'hi')).resolves.toBeUndefined();
  });
});
