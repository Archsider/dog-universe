import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/prisma';
import { getEmailTemplate } from '@/lib/email';
import { sendEmailNow } from '@/lib/notify-now';
import { revalidateTag } from 'next/cache';
import { invalidateNotifCount } from '@/lib/notifications';
import { requireRole } from '@/lib/auth-guards';

// PATCH /api/admin/loyalty/claims/[id] — approve or reject a claim
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

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
  let claim;
  try {
    claim = await Sentry.startSpan(
    { name: 'mutation.loyaltyClaim.review', op: 'db', attributes: { claimId: id, action } },
    () => prisma.$transaction(async (tx) => {
    const existing = await tx.loyaltyBenefitClaim.findUnique({
      where: { id },
      include: { client: { select: { id: true, name: true, email: true, language: true, role: true, anonymizedAt: true } } },
    });
    if (!existing) throw new Error('CLAIM_NOT_FOUND');

    // L1 cross-role guard: ADMIN cannot review claims belonging to non-CLIENT
    // users. SUPERADMIN passes through. Checked before any write.
    if (session.user.role === 'ADMIN' && existing.client.role !== 'CLIENT') {
      throw new Error('FORBIDDEN_CROSS_ROLE');
    }

    // Atomic state guard: only a PENDING claim transitions. A double-click
    // (or approve racing reject) hits count=0 on the 2nd request — so the
    // notification / email / loyalty side effects never fire twice.
    const res = await tx.loyaltyBenefitClaim.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: action,
        rejectionReason: reasonClean,
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
      },
    });
    if (res.count === 0) throw new Error('ALREADY_RESOLVED');

    // RGPD: this path inserts the notification directly (bypassing
    // createNotification's anonymizedAt chokepoint). Skip notifying a client
    // whose account has been anonymized (right-to-be-forgotten).
    if (!existing.client.anonymizedAt) {
    await tx.notification.create({
      data: {
        userId: existing.clientId,
        type: 'LOYALTY_UPDATE',
        titleFr: isApproved ? 'Avantage fidélité accordé' : 'Réclamation d\'avantage refusée',
        titleEn: isApproved ? 'Loyalty benefit granted' : 'Benefit claim rejected',
        messageFr: isApproved
          ? `Votre demande pour « ${existing.benefitLabelFr} » a été acceptée. Notre équipe vous contactera pour la mise en place.`
          : `Votre demande pour « ${existing.benefitLabelFr} » a été refusée.${reasonClean ? ` Motif : ${reasonClean}` : ''}`,
        messageEn: isApproved
          ? `Your request for "${existing.benefitLabelEn}" has been approved. Our team will contact you shortly.`
          : `Your request for "${existing.benefitLabelEn}" has been rejected.${reasonClean ? ` Reason: ${reasonClean}` : ''}`,
        read: false,
      },
    });
    }

    return { ...existing, status: action, rejectionReason: reasonClean, reviewedBy: session.user.id };
    }),
  );
  } catch (err) {
    if (err instanceof Error) {
      // Cross-role rejection / not-found / already-resolved — tx rolled back.
      if (err.message === 'FORBIDDEN_CROSS_ROLE') return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
      if (err.message === 'CLAIM_NOT_FOUND') return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
      if (err.message === 'ALREADY_RESOLVED') return NextResponse.json({ error: 'ALREADY_RESOLVED' }, { status: 409 });
    }
    throw err;
  }

  // Email is fire-and-forget post-commit — an SMTP outage must not roll back
  // a successfully approved claim. RGPD: never email an anonymized client
  // (their address is a synthetic placeholder).
  if (!claim.client.anonymizedAt) {
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
    sendEmailNow({ to: claim.client.email, subject, html });
  }

  // Notification was inserted via tx.notification.create (bypassing the
  // createNotification helper that auto-invalidates), so do it manually here.
  await invalidateNotifCount(claim.clientId);
  // Claim moved out of PENDING → admin claims badge changes.
  revalidateTag('admin-counts');

  return NextResponse.json(claim);
}
