// Parrainage Royal — service layer.
//
// Three public operations :
//   1. createReferralFromToken({ refereeId, refereeEmail, token }) → called
//      from POST /api/register when the body carries a `sponsorToken`.
//      Creates the Referral row in SIGNED_UP state.
//   2. rewardReferralIfApplicable(refereeId) → called from the booking
//      COMPLETED transition. Flips the referee's SIGNED_UP row to
//      REWARDED if this is their 1st COMPLETED booking, returns the row
//      so the caller can notify both parties.
//   3. getAmbassadorBadge(userId) → returns the badge tier ("none" /
//      "silver" / "gold") used by MemberCard.tsx.
//
// All ops are fail-soft — the calling flow (register, booking complete)
// must not break because the referral path glitched.

import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { verifyReferralToken } from '@/lib/referral-token';
import { logger } from '@/lib/logger';

type Client = PrismaClient | Prisma.TransactionClient;

export interface CreateReferralResult {
  ok: boolean;
  referralId?: string;
  sponsorId?: string;
  reason?: 'INVALID_TOKEN' | 'SELF_REFERRAL' | 'ALREADY_REFERRED' | 'DUPLICATE' | 'SPONSOR_NOT_FOUND';
}

/**
 * Called from POST /api/register when the body carries a sponsorToken.
 * Idempotent : a re-attempt for the same (sponsor, referee) pair is a noop.
 */
export async function createReferralFromToken(
  input: { refereeId: string; refereeEmail?: string | null; token: string },
  client: Client = defaultPrisma,
): Promise<CreateReferralResult> {
  const verified = verifyReferralToken(input.token);
  if (!verified) return { ok: false, reason: 'INVALID_TOKEN' };
  if (verified.sponsorId === input.refereeId) {
    return { ok: false, reason: 'SELF_REFERRAL' };
  }

  // Verify the sponsor still exists + is a real CLIENT (not anonymized, not
  // soft-deleted, not walk-in).  We don't want a token signed for a
  // deleted/walk-in account to spawn referral rows.
  const sponsor = await client.user.findFirst({
    where: notDeleted({ id: verified.sponsorId, isWalkIn: false }),
    select: { id: true, anonymizedAt: true },
  });
  if (!sponsor || sponsor.anonymizedAt) {
    return { ok: false, reason: 'SPONSOR_NOT_FOUND' };
  }

  // A given user is referred by at most one sponsor — first link wins.
  const existing = await client.referral.findFirst({
    where: { refereeId: input.refereeId },
    select: { id: true, sponsorId: true },
  });
  if (existing) {
    return existing.sponsorId === verified.sponsorId
      ? { ok: true, referralId: existing.id, sponsorId: existing.sponsorId, reason: 'DUPLICATE' }
      : { ok: false, reason: 'ALREADY_REFERRED' };
  }

  try {
    const row = await client.referral.create({
      data: {
        sponsorId: verified.sponsorId,
        refereeId: input.refereeId,
        refereeEmail: input.refereeEmail ?? null,
        status: 'SIGNED_UP',
        signedUpAt: new Date(),
      },
      select: { id: true, sponsorId: true },
    });
    return { ok: true, referralId: row.id, sponsorId: row.sponsorId };
  } catch (err) {
    // P2002 unique violation = race on the same (sponsor, referee) pair.
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
      return { ok: true, reason: 'DUPLICATE' };
    }
    logger.error('referral', 'createReferralFromToken failed', { error: err instanceof Error ? err.message : String(err) });
    return { ok: false };
  }
}

export interface RewardResult {
  rewarded: boolean;
  sponsorId?: string;
  refereeId?: string;
  referralId?: string;
}

/**
 * Called from the booking COMPLETED transition.  Idempotent :
 *   - If the referee was never referred → noop.
 *   - If their Referral is already REWARDED → noop.
 *   - Otherwise flip SIGNED_UP → REWARDED and return the row so the
 *     caller can fire notifications to both parties.
 */
export async function rewardReferralIfApplicable(
  refereeId: string,
  client: Client = defaultPrisma,
): Promise<RewardResult> {
  try {
    const referral = await client.referral.findFirst({
      where: { refereeId, status: 'SIGNED_UP' },
      select: { id: true, sponsorId: true },
    });
    if (!referral) return { rewarded: false };

    // Optimistic-lock-ish : updateMany on the specific status ensures we
    // never double-fire if two COMPLETED transitions race.
    const updated = await client.referral.updateMany({
      where: { id: referral.id, status: 'SIGNED_UP' },
      data: { status: 'REWARDED', rewardedAt: new Date() },
    });
    if (updated.count === 0) return { rewarded: false };

    return {
      rewarded: true,
      referralId: referral.id,
      sponsorId: referral.sponsorId,
      refereeId,
    };
  } catch (err) {
    logger.error('referral', 'rewardReferralIfApplicable failed', { refereeId, error: err instanceof Error ? err.message : String(err) });
    return { rewarded: false };
  }
}

export type AmbassadorTier = 'none' | 'bronze' | 'silver' | 'gold';

/**
 * Compute the Ambassador tier for the MemberCard badge.  Based on the
 * count of REWARDED referrals (a SIGNED_UP referee that hasn't booked
 * yet doesn't unlock the tier — that's the "Royal" part : you earn it
 * by bringing customers, not just signups).
 *
 *   1 reward  → bronze
 *   3 rewards → silver
 *   6 rewards → gold
 */
export async function getAmbassadorTier(
  userId: string,
  client: Client = defaultPrisma,
): Promise<{ tier: AmbassadorTier; rewarded: number; signedUp: number }> {
  const [rewarded, signedUp] = await Promise.all([
    client.referral.count({ where: { sponsorId: userId, status: 'REWARDED' } }),
    client.referral.count({ where: { sponsorId: userId, status: 'SIGNED_UP' } }),
  ]);
  const tier: AmbassadorTier =
    rewarded >= 6 ? 'gold'
    : rewarded >= 3 ? 'silver'
    : rewarded >= 1 ? 'bronze'
    : 'none';
  return { tier, rewarded, signedUp };
}
