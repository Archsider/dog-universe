import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findFirst: vi.fn() },
    referral: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import {
  createReferralFromToken,
  rewardReferralIfApplicable,
  getAmbassadorTier,
} from '../referral';
import { signReferralToken } from '../referral-token';

describe('referral service', () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = 'test-secret-at-least-16-chars-long';
    vi.clearAllMocks();
  });

  describe('createReferralFromToken', () => {
    it('rejects invalid token', async () => {
      const r = await createReferralFromToken({ refereeId: 'u_referee', token: 'garbage' });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('INVALID_TOKEN');
    });

    it('rejects self-referral', async () => {
      const token = signReferralToken('u_same');
      const r = await createReferralFromToken({ refereeId: 'u_same', token });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('SELF_REFERRAL');
    });

    it('rejects deleted / walk-in sponsor', async () => {
      mocks.prisma.user.findFirst.mockResolvedValueOnce(null);
      const token = signReferralToken('u_sponsor');
      const r = await createReferralFromToken({ refereeId: 'u_friend', token });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('SPONSOR_NOT_FOUND');
    });

    it('rejects anonymized sponsor', async () => {
      mocks.prisma.user.findFirst.mockResolvedValueOnce({ id: 'u_sponsor', anonymizedAt: new Date() });
      const token = signReferralToken('u_sponsor');
      const r = await createReferralFromToken({ refereeId: 'u_friend', token });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('SPONSOR_NOT_FOUND');
    });

    it('creates the referral row in SIGNED_UP state on first link', async () => {
      mocks.prisma.user.findFirst.mockResolvedValueOnce({ id: 'u_sponsor', anonymizedAt: null });
      mocks.prisma.referral.findFirst.mockResolvedValueOnce(null);
      mocks.prisma.referral.create.mockResolvedValueOnce({ id: 'ref_1', sponsorId: 'u_sponsor' });

      const token = signReferralToken('u_sponsor');
      const r = await createReferralFromToken({ refereeId: 'u_friend', token });

      expect(r.ok).toBe(true);
      expect(r.sponsorId).toBe('u_sponsor');
      expect(mocks.prisma.referral.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          sponsorId: 'u_sponsor',
          refereeId: 'u_friend',
          status: 'SIGNED_UP',
        }),
      }));
    });

    it('returns DUPLICATE if same sponsor/referee pair already linked', async () => {
      mocks.prisma.user.findFirst.mockResolvedValueOnce({ id: 'u_sponsor', anonymizedAt: null });
      mocks.prisma.referral.findFirst.mockResolvedValueOnce({ id: 'ref_old', sponsorId: 'u_sponsor' });
      const token = signReferralToken('u_sponsor');
      const r = await createReferralFromToken({ refereeId: 'u_friend', token });
      expect(r.ok).toBe(true);
      expect(r.reason).toBe('DUPLICATE');
      expect(mocks.prisma.referral.create).not.toHaveBeenCalled();
    });

    it('rejects ALREADY_REFERRED if referee was sponsored by someone else', async () => {
      mocks.prisma.user.findFirst.mockResolvedValueOnce({ id: 'u_sponsor', anonymizedAt: null });
      mocks.prisma.referral.findFirst.mockResolvedValueOnce({ id: 'ref_other', sponsorId: 'u_OTHER_sponsor' });
      const token = signReferralToken('u_sponsor');
      const r = await createReferralFromToken({ refereeId: 'u_friend', token });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('ALREADY_REFERRED');
    });

    it('idempotent on P2002 unique-violation race', async () => {
      mocks.prisma.user.findFirst.mockResolvedValueOnce({ id: 'u_sponsor', anonymizedAt: null });
      mocks.prisma.referral.findFirst.mockResolvedValueOnce(null);
      mocks.prisma.referral.create.mockRejectedValueOnce({ code: 'P2002' });

      const token = signReferralToken('u_sponsor');
      const r = await createReferralFromToken({ refereeId: 'u_friend', token });
      expect(r.ok).toBe(true);
      expect(r.reason).toBe('DUPLICATE');
    });
  });

  describe('rewardReferralIfApplicable', () => {
    it('returns rewarded:false when referee was never referred', async () => {
      mocks.prisma.referral.findFirst.mockResolvedValueOnce(null);
      const r = await rewardReferralIfApplicable('u_solo');
      expect(r.rewarded).toBe(false);
    });

    it('returns rewarded:true and flips SIGNED_UP → REWARDED on 1st complete', async () => {
      mocks.prisma.referral.findFirst.mockResolvedValueOnce({ id: 'ref_1', sponsorId: 'u_sponsor' });
      mocks.prisma.referral.updateMany.mockResolvedValueOnce({ count: 1 });

      const r = await rewardReferralIfApplicable('u_friend');
      expect(r.rewarded).toBe(true);
      expect(r.sponsorId).toBe('u_sponsor');
      expect(r.refereeId).toBe('u_friend');
      expect(mocks.prisma.referral.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'ref_1', status: 'SIGNED_UP' },
        data: expect.objectContaining({ status: 'REWARDED' }),
      }));
    });

    it('returns rewarded:false on race (another tx already flipped)', async () => {
      mocks.prisma.referral.findFirst.mockResolvedValueOnce({ id: 'ref_2', sponsorId: 'u_sponsor' });
      mocks.prisma.referral.updateMany.mockResolvedValueOnce({ count: 0 });
      const r = await rewardReferralIfApplicable('u_friend');
      expect(r.rewarded).toBe(false);
    });

    it('fail-soft on prisma exception (never throws)', async () => {
      mocks.prisma.referral.findFirst.mockRejectedValueOnce(new Error('DB down'));
      const r = await rewardReferralIfApplicable('u_friend');
      expect(r.rewarded).toBe(false);
    });
  });

  describe('getAmbassadorTier', () => {
    it('returns none for 0 rewarded', async () => {
      mocks.prisma.referral.count.mockResolvedValueOnce(0); // rewarded
      mocks.prisma.referral.count.mockResolvedValueOnce(0); // signedUp
      const r = await getAmbassadorTier('u_x');
      expect(r.tier).toBe('none');
      expect(r.rewarded).toBe(0);
    });

    it('returns bronze for 1-2 rewarded', async () => {
      mocks.prisma.referral.count.mockResolvedValueOnce(2);
      mocks.prisma.referral.count.mockResolvedValueOnce(1);
      const r = await getAmbassadorTier('u_x');
      expect(r.tier).toBe('bronze');
    });

    it('returns silver at 3 rewarded', async () => {
      mocks.prisma.referral.count.mockResolvedValueOnce(3);
      mocks.prisma.referral.count.mockResolvedValueOnce(0);
      const r = await getAmbassadorTier('u_x');
      expect(r.tier).toBe('silver');
    });

    it('returns gold at 6+ rewarded', async () => {
      mocks.prisma.referral.count.mockResolvedValueOnce(6);
      mocks.prisma.referral.count.mockResolvedValueOnce(2);
      const r = await getAmbassadorTier('u_x');
      expect(r.tier).toBe('gold');
      expect(r.signedUp).toBe(2);
    });
  });
});
