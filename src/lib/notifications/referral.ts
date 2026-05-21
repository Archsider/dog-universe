// Parrainage Royal — notification helpers.
//
// Fired post-commit when a referee completes their 1st booking. Both
// parties get a REFERRAL_REWARDED in-app notif ; the sponsor's message
// differs from the referee's (perspective + thank-you tone).
//
// Email is fire-and-forget — a glitch here never blocks the booking
// status transition that triggered the reward.

import { createNotification } from './core';

const SPONSOR_MSG = {
  titleFr: '🎁 Parrainage récompensé',
  titleEn: '🎁 Sponsorship rewarded',
  messageFr: 'Votre filleul·e vient de terminer son premier séjour chez Dog Universe. Merci de faire grandir la famille — un avantage fidélité vous attend !',
  messageEn: 'Your referee just completed their first stay at Dog Universe. Thanks for growing the family — a loyalty perk awaits you!',
} as const;

const REFEREE_MSG = {
  titleFr: '🎉 Bienvenue chez Dog Universe',
  titleEn: '🎉 Welcome to Dog Universe',
  messageFr: 'Premier séjour terminé avec succès ! Grâce au parrainage, vous bénéficiez d\'un avantage fidélité. À très bientôt 🐾',
  messageEn: 'First stay completed successfully! Thanks to the sponsorship, a loyalty perk is now yours. See you soon 🐾',
} as const;

export async function createReferralRewardedNotification(
  userId: string,
  party: 'sponsor' | 'referee',
): Promise<void> {
  const msg = party === 'sponsor' ? SPONSOR_MSG : REFEREE_MSG;
  try {
    await createNotification({
      userId,
      type: 'REFERRAL_REWARDED',
      titleFr: msg.titleFr,
      titleEn: msg.titleEn,
      messageFr: msg.messageFr,
      messageEn: msg.messageEn,
      metadata: { party },
    });
  } catch {
    /* swallow — never break the calling flow */
  }
}
