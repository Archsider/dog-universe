/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stable secret for token signing throughout the test.
process.env.TIME_PROPOSAL_TOKEN_SECRET = 'a'.repeat(32);

const bookingFindFirst = vi.fn();
const tpFindFirst = vi.fn();
const tpFindUnique = vi.fn();
const tpFindMany = vi.fn();
const tpCreate = vi.fn();
const tpUpdate = vi.fn();
const tpUpdateMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    booking: { findFirst: (args: any) => bookingFindFirst(args) },
    timeProposal: {
      findFirst: (args: any) => tpFindFirst(args),
      findUnique: (args: any) => tpFindUnique(args),
      findMany: (args: any) => tpFindMany(args),
      create: (args: any) => tpCreate(args),
      update: (args: any) => tpUpdate(args),
      updateMany: (args: any) => tpUpdateMany(args),
    },
  },
}));

beforeEach(() => {
  bookingFindFirst.mockReset();
  tpFindFirst.mockReset();
  tpFindUnique.mockReset();
  tpFindMany.mockReset();
  tpCreate.mockReset();
  tpUpdate.mockReset();
  tpUpdateMany.mockReset();
  bookingFindFirst.mockResolvedValue({ status: 'CONFIRMED' });
  tpUpdateMany.mockResolvedValue({ count: 0 });
});

async function mod() { return import('../time-proposals'); }

describe('time-proposals — validation', () => {
  it('isValidTime accepts HH:MM 24h, rejects others', async () => {
    const { isValidTime } = await mod();
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('09:30')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9:30')).toBe(false);
    expect(isValidTime('10:60')).toBe(false);
    expect(isValidTime('abc')).toBe(false);
  });
});

describe('time-proposals — token sign + verify', () => {
  it('signed token round-trips via verifyTimeProposalToken', async () => {
    const { __test, verifyTimeProposalToken } = await mod();
    const token = __test.signToken('tp_abcdef123456');
    expect(verifyTimeProposalToken(token)).toBe('tp_abcdef123456');
  });

  it('rejects tampered tokens', async () => {
    const { __test, verifyTimeProposalToken } = await mod();
    const token = __test.signToken('tp_abcdef123456');
    const tampered = token.replace(/.$/, 'X');
    expect(verifyTimeProposalToken(tampered)).toBeNull();
  });

  it('rejects malformed tokens', async () => {
    const { verifyTimeProposalToken } = await mod();
    expect(verifyTimeProposalToken('')).toBeNull();
    expect(verifyTimeProposalToken('justonepart')).toBeNull();
    expect(verifyTimeProposalToken('a.b')).toBeNull();
    expect(verifyTimeProposalToken('a.b.c.d')).toBeNull();
  });

  it('rejects token signed with another secret', async () => {
    const { __test, verifyTimeProposalToken } = await mod();
    const token = __test.signToken('tp_x');
    process.env.TIME_PROPOSAL_TOKEN_SECRET = 'b'.repeat(32);
    expect(verifyTimeProposalToken(token)).toBeNull();
    process.env.TIME_PROPOSAL_TOKEN_SECRET = 'a'.repeat(32);
  });
});

describe('time-proposals — createProposal state machine', () => {
  it('rejects an invalid time', async () => {
    const { createProposal } = await mod();
    const r = await createProposal({
      bookingId: 'b1', scope: 'ARRIVAL', time: 'abc',
      proposedBy: 'u1', proposedByRole: 'CLIENT',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_TIME');
  });

  it('rejects when booking is not found / soft-deleted', async () => {
    bookingFindFirst.mockResolvedValueOnce(null);
    const { createProposal } = await mod();
    const r = await createProposal({
      bookingId: 'b1', scope: 'ARRIVAL', time: '10:00',
      proposedBy: 'u1', proposedByRole: 'CLIENT',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('BOOKING_NOT_FOUND');
  });

  it('rejects when booking is CANCELLED / COMPLETED / NO_SHOW / REJECTED', async () => {
    const { createProposal } = await mod();
    for (const status of ['CANCELLED', 'COMPLETED', 'NO_SHOW', 'REJECTED']) {
      bookingFindFirst.mockResolvedValueOnce({ status });
      const r = await createProposal({
        bookingId: 'b1', scope: 'ARRIVAL', time: '10:00',
        proposedBy: 'u1', proposedByRole: 'CLIENT',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('BOOKING_NOT_OPEN');
    }
  });

  it('supersedes existing PENDING then creates a new one (ADMIN proposer → publicToken set)', async () => {
    tpCreate.mockImplementationOnce((args: any) => Promise.resolve({
      id: args.data.id,
      publicToken: args.data.publicToken,
      publicTokenExpiresAt: args.data.publicTokenExpiresAt,
    }));
    const { createProposal, verifyTimeProposalToken } = await mod();
    const r = await createProposal({
      bookingId: 'b1', scope: 'ARRIVAL', time: '11:00',
      proposedBy: 'admin1', proposedByRole: 'ADMIN',
      proposalNote: 'équipe restreinte',
    });
    expect(r.ok).toBe(true);
    // updateMany called to supersede previous PENDING
    expect(tpUpdateMany).toHaveBeenCalledOnce();
    expect(tpUpdateMany.mock.calls[0][0].data.status).toBe('SUPERSEDED');
    if (r.ok) {
      expect(r.publicToken).toBeTruthy();
      expect(verifyTimeProposalToken(r.publicToken!)).toBe(r.proposalId);
    }
  });

  it('CLIENT-proposed → no publicToken (admin uses session)', async () => {
    tpCreate.mockImplementationOnce((args: any) => Promise.resolve({
      id: args.data.id,
      publicToken: args.data.publicToken,
      publicTokenExpiresAt: args.data.publicTokenExpiresAt,
    }));
    const { createProposal } = await mod();
    const r = await createProposal({
      bookingId: 'b1', scope: 'ARRIVAL', time: '10:00',
      proposedBy: 'client1', proposedByRole: 'CLIENT',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.publicToken).toBeNull();
  });
});

describe('time-proposals — accept / reject', () => {
  it('acceptProposal flips PENDING → ACCEPTED and clears the token', async () => {
    tpFindUnique.mockResolvedValueOnce({ id: 'tp1', status: 'PENDING' });
    tpUpdate.mockResolvedValueOnce({ id: 'tp1', status: 'ACCEPTED' });
    const { acceptProposal } = await mod();
    const r = await acceptProposal({
      proposalId: 'tp1', respondedBy: 'admin1', respondedByRole: 'ADMIN',
    });
    expect(r.ok).toBe(true);
    const data = tpUpdate.mock.calls[0][0].data;
    expect(data.status).toBe('ACCEPTED');
    expect(data.publicToken).toBeNull();
    expect(data.publicTokenExpiresAt).toBeNull();
  });

  it('acceptProposal refuses non-PENDING', async () => {
    tpFindUnique.mockResolvedValueOnce({ id: 'tp1', status: 'SUPERSEDED' });
    const { acceptProposal } = await mod();
    const r = await acceptProposal({
      proposalId: 'tp1', respondedBy: 'a', respondedByRole: 'ADMIN',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('PROPOSAL_NOT_PENDING');
  });

  it('acceptProposal returns PROPOSAL_NOT_FOUND for missing id', async () => {
    tpFindUnique.mockResolvedValueOnce(null);
    const { acceptProposal } = await mod();
    const r = await acceptProposal({
      proposalId: 'tp1', respondedBy: 'a', respondedByRole: 'ADMIN',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('PROPOSAL_NOT_FOUND');
  });

  it('rejectProposal flips PENDING → REJECTED with a reason', async () => {
    tpFindUnique.mockResolvedValueOnce({ id: 'tp1', status: 'PENDING' });
    tpUpdate.mockResolvedValueOnce({ id: 'tp1', status: 'REJECTED' });
    const { rejectProposal } = await mod();
    const r = await rejectProposal({
      proposalId: 'tp1', respondedBy: 'client1', respondedByRole: 'CLIENT',
      responseNote: 'pas possible à cette heure',
    });
    expect(r.ok).toBe(true);
    const data = tpUpdate.mock.calls[0][0].data;
    expect(data.status).toBe('REJECTED');
    expect(data.responseNote).toBe('pas possible à cette heure');
  });
});

describe('time-proposals — getConfirmedTime / getCurrentProposal', () => {
  it('getConfirmedTime returns the latest ACCEPTED time', async () => {
    tpFindFirst.mockResolvedValueOnce({ time: '10:30' });
    const { getConfirmedTime } = await mod();
    const t = await getConfirmedTime('b1', 'ARRIVAL');
    expect(t).toBe('10:30');
    const args = tpFindFirst.mock.calls[0][0];
    expect(args.where.status).toBe('ACCEPTED');
    expect(args.orderBy.respondedAt).toBe('desc');
  });

  it('getConfirmedTime returns null when no ACCEPTED proposal exists', async () => {
    tpFindFirst.mockResolvedValueOnce(null);
    const { getConfirmedTime } = await mod();
    expect(await getConfirmedTime('b1', 'ARRIVAL')).toBeNull();
  });

  it('getCurrentProposal returns the latest PENDING', async () => {
    tpFindFirst.mockResolvedValueOnce({ id: 'tp1', time: '11:00', status: 'PENDING' });
    const { getCurrentProposal } = await mod();
    const p = await getCurrentProposal('b1', 'ARRIVAL');
    expect(p?.id).toBe('tp1');
    const args = tpFindFirst.mock.calls[0][0];
    expect(args.where.status).toBe('PENDING');
  });
});

describe('time-proposals — supersedePendingForBooking cascade', () => {
  it('supersedes both PENDING and ACCEPTED proposals (cancel cascade)', async () => {
    // Wave 2 fix: cancel/reject of a booking now sweeps ACCEPTED too —
    // until 2026-05-19, getConfirmedTime() kept returning the old time
    // after a cancel because only PENDING were swept.
    tpUpdateMany.mockResolvedValueOnce({ count: 3 });
    const { supersedePendingForBooking } = await mod();
    const n = await supersedePendingForBooking('b1');
    expect(n).toBe(3);
    const where = tpUpdateMany.mock.calls[0][0].where;
    expect(where.bookingId).toBe('b1');
    expect(where.status).toEqual({ in: ['PENDING', 'ACCEPTED'] });
  });
});
