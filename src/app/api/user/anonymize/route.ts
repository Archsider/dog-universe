// RGPD Article 17 (right to erasure) — user-triggered soft anonymization.
//
// What is erased immediately:
//   - User PII: name → placeholder, email → tombstone, phone → null, password
//     → random (login impossible), historicalNote → null
//   - Pets: soft-deleted (deletedAt) — hard-deleted by purge-anonymized cron
//     after 3-year retention window expires
//   - Notifications: hard-deleted (no accounting obligation)
//   - AdminNotes targeting this user: hard-deleted
//   - PasswordResetTokens: hard-deleted (defence against reset-revival)
//   - tokenVersion incremented → invalidates every active JWT
//
// What is KEPT (legal accounting obligation 10 years, FR/MA):
//   - Bookings, Invoices, ActionLogs, ClientContract row + signed PDF
//
// Idempotent: a second call is rejected with 409 if anonymizedAt is already set.
// Refuses if the user has active bookings (PENDING / CONFIRMED / IN_PROGRESS)
// to avoid leaving operational stays orphaned.
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';

const ANONYMIZED_NAME = 'Utilisateur anonymisé';
const TOMBSTONE_DOMAIN = 'deleted.invalid';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, anonymizedAt: true, name: true, email: true },
  });
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (user.anonymizedAt) {
    return NextResponse.json(
      { error: 'ALREADY_ANONYMIZED', anonymizedAt: user.anonymizedAt },
      { status: 409 },
    );
  }

  const activeBookings = await prisma.booking.count({
    where: {
      clientId: userId,
      deletedAt: null,
      status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
    },
  });
  if (activeBookings > 0) {
    return NextResponse.json(
      { error: 'ACTIVE_BOOKINGS', count: activeBookings },
      { status: 409 },
    );
  }

  const now = new Date();
  // Tombstone email keeps the unique constraint satisfied while making
  // re-impersonation impossible (`.invalid` is RFC 6761 reserved).
  const tombstoneEmail = `anonymized-${userId}@${TOMBSTONE_DOMAIN}`;
  // Random password — bcrypt hash of 32 random bytes; nobody can know it.
  const randomPassword = randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(randomPassword, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        anonymizedAt: now,
        name: ANONYMIZED_NAME,
        email: tombstoneEmail,
        phone: null,
        passwordHash,
        historicalNote: null,
        tokenVersion: { increment: 1 },
      },
    }),
    prisma.pet.updateMany({
      where: { ownerId: userId, deletedAt: null },
      data: { deletedAt: now },
    }),
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.adminNote.deleteMany({
      where: { entityType: 'CLIENT', entityId: userId },
    }),
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
  ]);

  await logAction({
    userId,
    action: LOG_ACTIONS.RGPD_ANONYMIZE,
    entityType: 'User',
    entityId: userId,
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
    details: {
      previousEmailHash: hashEmailForAudit(user.email),
      anonymizedAt: now.toISOString(),
    },
  });

  return NextResponse.json({
    ok: true,
    anonymizedAt: now.toISOString(),
    message: 'Account anonymized. You will be logged out.',
  });
}

// Store only a SHA-256 of the previous email in the audit log so support can
// later verify "was this email anonymized?" without keeping the address itself.
function hashEmailForAudit(email: string): string {
  return createHash('sha256').update(email).digest('hex').slice(0, 16);
}
