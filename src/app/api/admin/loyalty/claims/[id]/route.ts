import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { revalidateTag } from 'next/cache';
import { invalidateNotifCount } from '@/lib/notifications';

// PATCH /api/admin/loyalty/claims/[id] — approve or reject a claim
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { action, rejectionReason } = await req.json();
  if (!['APPROVED', 'REJECTED'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
  if (action === 'REJECTED' && (!rejectionReason?.trim() || rejectionReason.trim().length < 3)) {
    return NextResponse.json({ error: 'Rejection reason required (min 3 characters)' }, { status: 400 });
  }

  const reasonClean = action === 'REJECTED' ? rejectionReason.trim() : null;
  const isApproved = action === 'APPROVED';

  // Atomic: claim status + in-app notification commit together. If the
  // notification insert fails the claim status update rolls back too, so
  // the admin sees the error and can retry — no silent "approved without
  // ever telling the client" state.
  const claim = await prisma.$transaction(async (tx) => {
    const updated = await tx.loyaltyBenefitClaim.update({
      where: { id },
      data: {
        status: action,
        rejectionReason: reasonClean,
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
      },
      include: { client: { select: { id: true, name: true, email: true, language: true } } },
    });

    await tx.notification.create({
      data: {
        userId: updated.clientId,
        type: 'LOYALTY_UPDATE',
        titleFr: isApproved ? 'Avantage fidélité accordé' : 'Réclamation d\'avantage refusée',
        titleEn: isApproved ? 'Loyalty benefit granted' : 'Benefit claim rejected',
        messageFr: isApproved
          ? `Votre demande pour « ${updated.benefitLabelFr} » a été acceptée. Notre équipe vous contactera pour la mise en place.`
          : `Votre demande pour « ${updated.benefitLabelFr} » a été refusée.${reasonClean ? ` Motif : ${reasonClean}` : ''}`,
        messageEn: isApproved
          ? `Your request for "${updated.benefitLabelEn}" has been approved. Our team will contact you shortly.`
          : `Your request for "${updated.benefitLabelEn}" has been rejected.${reasonClean ? ` Reason: ${reasonClean}` : ''}`,
        read: false,
      },
    });

    return updated;
  });

  // Email is fire-and-forget post-commit — an SMTP outage must not roll back
  // a successfully approved claim.
  const locale = claim.client.language ?? 'fr';
  const templateType = isApproved ? 'loyalty_claim_approved' : 'loyalty_claim_rejected';
  const { subject, html } = getEmailTemplate(
    templateType,
    {
      clientName: claim.client.name ?? claim.client.email,
      benefitFr: claim.benefitLabelFr,
      benefitEn: claim.benefitLabelEn,
      reason: reasonClean ?? '',
    },
    locale,
  );
  sendEmail({ to: claim.client.email, subject, html }).catch(() => {});

  // Notification was inserted via tx.notification.create (bypassing the
  // createNotification helper that auto-invalidates), so do it manually here.
  await invalidateNotifCount(claim.clientId);
  // Claim moved out of PENDING → admin claims badge changes.
  revalidateTag('admin-counts');

  return NextResponse.json(claim);
}
