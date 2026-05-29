import { prisma } from '@/lib/prisma';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { NOTIFICATION_MESSAGES } from '@/lib/notification-messages';
import { createNotification, createAdminNotifications } from './core';
import { contactable } from '@/lib/prisma-soft';

export async function createLoyaltyUpdateNotification(
  userId: string,
  grade: string,
  locale: string = 'fr'
) {
  const gradeLabels: Record<string, Record<string, string>> = {
    fr: { BRONZE: 'Bronze', SILVER: 'Argent', GOLD: 'Or', PLATINUM: 'Platine' },
    en: { BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold', PLATINUM: 'Platinum' },
  };
  const gradeFr = gradeLabels.fr[grade] ?? grade;
  const gradeEn = gradeLabels.en[grade] ?? grade;
  const msg = NOTIFICATION_MESSAGES.LOYALTY_UPDATE({ gradeFr, gradeEn });
  const notification = await createNotification({ userId, type: 'LOYALTY_UPDATE', ...msg });

  // Send email notification (non-blocking)
  try {
    // contactable() exclut les comptes anonymisés (RGPD).
    const client = await prisma.user.findFirst({ where: { ...contactable(), id: userId }, select: { name: true, email: true } });
    if (client) {
      const gradeLabel = locale === 'fr' ? gradeFr : gradeEn;
      const { subject, html } = getEmailTemplate('loyalty_update', { clientName: client.name, grade: gradeLabel }, locale);
      await sendEmail({ to: client.email, subject, html });
    }
  } catch { /* non-blocking */ }

  return notification;
}

export async function createLoyaltyClaimResultNotification(
  userId: string,
  benefitLabelFr: string,
  benefitLabelEn: string,
  status: 'APPROVED' | 'REJECTED',
  rejectionReason?: string | null
) {
  const isApproved = status === 'APPROVED';
  const key = isApproved ? 'LOYALTY_CLAIM_APPROVED' : 'LOYALTY_CLAIM_REJECTED';
  const msg = NOTIFICATION_MESSAGES[key]({
    benefitFr: benefitLabelFr,
    benefitEn: benefitLabelEn,
    reason: rejectionReason ?? '',
  });

  const notification = await createNotification({ userId, type: 'LOYALTY_UPDATE', ...msg });

  // Send email (non-blocking)
  try {
    const client = await prisma.user.findFirst({
      // contactable() exclut les comptes anonymisés (RGPD).
      where: { ...contactable(), id: userId },
      select: { name: true, email: true, language: true },
    });
    if (client) {
      const locale = client.language ?? 'fr';
      const templateType = isApproved ? 'loyalty_claim_approved' : 'loyalty_claim_rejected';
      const { subject, html } = getEmailTemplate(
        templateType,
        {
          clientName: client.name ?? client.email,
          benefitFr: benefitLabelFr,
          benefitEn: benefitLabelEn,
          reason: rejectionReason ?? '',
        },
        locale
      );
      await sendEmail({ to: client.email, subject, html });
    }
  } catch { /* non-blocking */ }

  return notification;
}

export async function notifyAdminsNewLoyaltyClaim(
  clientName: string,
  benefitLabelFr: string,
  benefitLabelEn: string,
  claimId: string
) {
  const msg = NOTIFICATION_MESSAGES.LOYALTY_CLAIM_PENDING({ clientName, benefitFr: benefitLabelFr, benefitEn: benefitLabelEn });
  return createAdminNotifications({ type: 'LOYALTY_CLAIM_PENDING', ...msg, metadata: { claimId } });
}
