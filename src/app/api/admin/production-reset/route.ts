/**
 * POST /api/admin/production-reset
 *
 * SUPERADMIN ONLY — Production clean-slate reset.
 *
 * Body: { dryRun?: boolean, password?: string, confirm?: string }
 *
 * - dryRun=true → returns counts of what WOULD be deleted (safe preview, no
 *   re-auth required)
 * - confirm='PRODUCTION_RESET_IRREVERSIBLE' AND password=<current> → performs
 *   the actual deletion (IRREVERSIBLE)
 *
 * Hardening (Sprint 1 sécurité critique) :
 *   - Re-auth password obligatoire (bcrypt compare contre passwordHash)
 *   - Confirmation token explicite : `confirm === 'PRODUCTION_RESET_IRREVERSIBLE'`
 *   - Rate-limit 3 tentatives / heure par userId via Redis
 *   - Audit log avant ET après l'opération
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
import bcrypt from 'bcryptjs';
import { Redis } from '@upstash/redis';

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW = 3600; // seconds
const CONFIRM_TOKEN = 'PRODUCTION_RESET_IRREVERSIBLE';

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function checkResetRateLimit(userId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true; // fail-open: no Redis → allow
  try {
    const key = `production-reset:attempts:${userId}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW);
    return count <= RATE_LIMIT_MAX;
  } catch {
    return true; // fail-open
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden — SUPERADMIN only' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const dryRun = body.dryRun === true;
  const confirm = typeof body.confirm === 'string' ? body.confirm : undefined;
  const password = typeof body.password === 'string' ? body.password : undefined;

  // ── Count what will be affected (used by both dryRun and confirm paths) ──
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

  // ── Confirmation token must match exactly ────────────────────────────────
  if (confirm !== CONFIRM_TOKEN) {
    return NextResponse.json(
      { error: 'CONFIRMATION_REQUIRED', expected: CONFIRM_TOKEN },
      { status: 400 },
    );
  }

  // ── Password required for re-auth ────────────────────────────────────────
  if (!password) {
    return NextResponse.json({ error: 'PASSWORD_REQUIRED' }, { status: 400 });
  }

  // ── Rate-limit (3 / hour per userId) ─────────────────────────────────────
  const allowed = await checkResetRateLimit(session.user.id);
  if (!allowed) {
    await logAction({
      userId: session.user.id,
      action: 'PRODUCTION_RESET_BLOCKED',
      entityType: 'System',
      details: { reason: 'RATE_LIMITED', performedBy: session.user.email },
    });
    return NextResponse.json({ error: 'TOO_MANY_ATTEMPTS' }, { status: 429 });
  }

  // ── Re-auth: bcrypt compare against current passwordHash ─────────────────
  const admin = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });
  const valid = admin ? await bcrypt.compare(password, admin.passwordHash) : false;
  if (!valid) {
    await logAction({
      userId: session.user.id,
      action: 'PRODUCTION_RESET_BLOCKED',
      entityType: 'System',
      details: { reason: 'WRONG_PASSWORD', performedBy: session.user.email },
    });
    return NextResponse.json({ error: 'INVALID_PASSWORD' }, { status: 403 });
  }

  // ── Audit BEFORE the destructive operation ──────────────────────────────
  await logAction({
    userId: session.user.id,
    action: 'PRODUCTION_RESET_INITIATED',
    entityType: 'System',
    details: { willDelete: preview, performedBy: session.user.email },
  });

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
    { timeout: 30000 },
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
