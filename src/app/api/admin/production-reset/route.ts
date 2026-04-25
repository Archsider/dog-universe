/**
 * POST /api/admin/production-reset
 *
 * SUPERADMIN ONLY — Production clean-slate reset.
 *
 * Body: { dryRun?: boolean, confirm?: boolean }
 *
 * - dryRun=true  → returns counts of what WOULD be deleted (safe preview)
 * - confirm=true → performs the actual deletion (IRREVERSIBLE)
 *
 * Preserved:
 *   - All ADMIN and SUPERADMIN user accounts
 *   - Settings (pricing config)
 *   - MonthlyRevenueSummary entries (historical data)
 *
 * Deleted (in FK-safe order):
 *   PasswordResetToken, LoyaltyBenefitClaim, LoyaltyGrade, Notification,
 *   StayPhoto, BookingPet, BoardingDetail, TaxiDetail, InvoiceItem,
 *   Invoice, Booking, AdminNote, ClientContract, PetDocument,
 *   Vaccination, Pet, ActionLog, User (CLIENT only)
 */

import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden — SUPERADMIN only' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const dryRun = body.dryRun === true;
  const confirm = body.confirm === true;

  if (!dryRun && !confirm) {
    return NextResponse.json(
      { error: 'Send { dryRun: true } to preview, or { confirm: true } to execute.' },
      { status: 400 }
    );
  }

  // ── Count what will be affected ──────────────────────────────────────────
  const [
    clientCount,
    petCount,
    bookingCount,
    invoiceCount,
    notificationCount,
    contractCount,
    loyaltyClaimCount,
    actionLogCount,
    adminNoteCount,
    passwordResetCount,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'CLIENT' } }),
    prisma.pet.count(),
    prisma.booking.count(),
    prisma.invoice.count(),
    prisma.notification.count(),
    prisma.clientContract.count(),
    prisma.loyaltyBenefitClaim.count(),
    prisma.actionLog.count(),
    prisma.adminNote.count(),
    prisma.passwordResetToken.count(),
  ]);

  const preview = {
    clients: clientCount,
    pets: petCount,
    bookings: bookingCount,
    invoices: invoiceCount,
    notifications: notificationCount,
    contracts: contractCount,
    loyaltyClaims: loyaltyClaimCount,
    actionLogs: actionLogCount,
    adminNotes: adminNoteCount,
    passwordResetTokens: passwordResetCount,
    preserved: 'All ADMIN/SUPERADMIN accounts and Settings are preserved.',
  };

  if (dryRun) {
    return NextResponse.json({ dryRun: true, wouldDelete: preview });
  }

  // ── CONFIRM: perform irreversible deletion ───────────────────────────────
  await prisma.$transaction(
    async (tx) => {
      // 1. Tokens
      await tx.passwordResetToken.deleteMany();

      // 2. Loyalty claims and grades (for CLIENT users only)
      await tx.loyaltyBenefitClaim.deleteMany();
      await tx.loyaltyGrade.deleteMany({
        where: { client: { role: 'CLIENT' } },
      });

      // 3. Notifications
      await tx.notification.deleteMany();

      // 4. Admin notes
      await tx.adminNote.deleteMany();

      // 5. Stay photos (cascade from Booking, but explicit)
      await tx.stayPhoto.deleteMany();

      // 6. Booking sub-tables
      await tx.bookingPet.deleteMany();
      await tx.boardingDetail.deleteMany();
      await tx.taxiDetail.deleteMany();

      // 7. Invoice items then invoices
      await tx.invoiceItem.deleteMany();
      await tx.invoice.deleteMany();

      // 8. Bookings
      await tx.booking.deleteMany();

      // 9. Contracts (files in storage — manual cleanup required)
      await tx.clientContract.deleteMany();

      // 10. Pet sub-tables then pets
      await tx.petDocument.deleteMany();
      await tx.vaccination.deleteMany();
      await tx.pet.deleteMany();

      // 11. Action logs (no FK constraint issue, linked to users)
      await tx.actionLog.deleteMany();

      // 12. CLIENT users only — ADMIN/SUPERADMIN preserved
      await tx.user.deleteMany({ where: { role: 'CLIENT' } });
    },
    { timeout: 30000 }
  );

  await logAction({
    userId: session.user.id,
    action: 'PRODUCTION_RESET',
    entityType: 'System',
    details: { deleted: preview, performedBy: session.user.email },
  });

  return NextResponse.json({
    success: true,
    deleted: preview,
    warning:
      'Contract files in Supabase Storage (uploads-private/contracts/) must be deleted manually.',
  });
}
