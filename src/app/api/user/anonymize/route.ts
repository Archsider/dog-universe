// RGPD anonymization — droit à l'oubli (loi 09-08 + art. 17 RGPD).
// Wipes identifiable PII from the User row + cascades soft-deletes / nullifies
// related sensitive data. Bookings + Invoices stay intact (accounting duty)
// but the linked User row no longer identifies the person.
//
// Auth:
//   - CLIENT  → must POST { password } and anonymizes their own account.
//                Active bookings (PENDING / CONFIRMED / IN_PROGRESS / AT_PICKUP /
//                PENDING_EXTENSION) block the request.
//   - SUPERADMIN → may POST { userId } without password. Same active-booking
//                  guard applies (admin still has to wait or cancel first).
//
// Idempotent: a User already marked anonymizedAt returns 200 with
// { alreadyAnonymized: true } and no further mutation.
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';
import { log } from '@/lib/logger';

const BLOCKING_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'AT_PICKUP', 'PENDING_EXTENSION'] as const;

interface Body {
  password?: string;
  userId?: string;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  // Determine target & enforce auth model
  let targetUserId = session.user.id;
  const isAdminFlow = !!body.userId && body.userId !== session.user.id;
  if (isAdminFlow) {
    if (session.user.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    targetUserId = body.userId!;
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true, anonymizedAt: true, passwordHash: true, email: true, phone: true, name: true, contract: { select: { id: true } } },
  });
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Idempotency: re-running on an already-anonymized account is a no-op
  if (target.anonymizedAt) {
    return NextResponse.json({ success: true, alreadyAnonymized: true });
  }

  // Self-anonymization requires password confirmation
  if (!isAdminFlow) {
    if (typeof body.password !== 'string' || body.password.length === 0) {
      return NextResponse.json({ error: 'PASSWORD_REQUIRED' }, { status: 400 });
    }
    const valid = await bcrypt.compare(body.password, target.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'INVALID_PASSWORD' }, { status: 400 });
    }
  }

  // Refuse to wipe a non-CLIENT (admins/superadmins keep their identity)
  if (target.role !== 'CLIENT') {
    return NextResponse.json({ error: 'NOT_A_CLIENT' }, { status: 400 });
  }

  // Block if any active booking is still on the books
  const activeBooking = await prisma.booking.findFirst({
    where: {
      clientId: targetUserId,
      deletedAt: null, // soft-delete: required — no global extension (Edge Runtime incompatible)
      status: { in: [...BLOCKING_STATUSES] },
    },
    select: { id: true, status: true, startDate: true },
  });
  if (activeBooking) {
    return NextResponse.json(
      {
        error: 'ACTIVE_BOOKING_EXISTS',
        bookingId: activeBooking.id,
        status: activeBooking.status,
        startDate: activeBooking.startDate,
      },
      { status: 400 },
    );
  }

  const now = new Date();
  const anonymizedEmail = `deleted_${targetUserId}@doguniverse.invalid`;
  const anonymizedHash = await bcrypt.hash(`anon-${targetUserId}-${now.getTime()}`, 10);

  try {
  await prisma.$transaction(async (tx) => {
    // Wipe PII on the User row + invalidate all sessions (tokenVersion bump)
    await tx.user.update({
      where: { id: targetUserId },
      data: {
        name: 'Utilisateur supprimé',
        email: anonymizedEmail,
        phone: null,
        passwordHash: anonymizedHash,
        anonymizedAt: now,
        tokenVersion: { increment: 1 },
        historicalNote: null,
      },
    });

    // Soft-delete pets (already-archived stay archived)
    await tx.pet.updateMany({
      where: { ownerId: targetUserId, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
      data: { deletedAt: now },
    });

    // Drop notification history (no accounting value)
    await tx.notification.deleteMany({ where: { userId: targetUserId } });

    // Drop pending password reset tokens
    await tx.passwordResetToken.deleteMany({ where: { userId: targetUserId } });

    // Nullify contract storage references (PDF stays in private bucket — admin
    // can purge it manually; the link from the User row is severed here).
    if (target.contract) {
      await tx.clientContract.update({
        where: { id: target.contract.id },
        data: { pdfUrl: null, ipAddress: null },
      });
    }

    // Pseudonymize PII in ActionLog metadata (RGPD right to erasure).
    // Audit value preserved: userId (actor), action, entityType, createdAt unchanged.
    // Strategy: scope to rows where the user is SUBJECT (actor=userId OR
    // entityType='User'+entityId=userId) PLUS any row whose `details` JSON
    // string mentions the old email or phone (best-effort string replace for
    // PII embedded in nested metadata of bookings/notifications/etc).
    const PII_KEYS = ['email', 'phone', 'name', 'address', 'firstName', 'lastName', 'fullName'];
    const oldEmail = target.email;
    const oldPhone = target.phone;
    const oldName = target.name;
    const ANON = '[ANONYMIZED]';

    const orFilters: Array<Record<string, unknown>> = [
      { userId: targetUserId },
      { entityType: 'User', entityId: targetUserId },
    ];
    if (oldEmail) orFilters.push({ details: { contains: oldEmail } });
    if (oldPhone) orFilters.push({ details: { contains: oldPhone } });

    const BATCH = 500;
    let lastId: string | null = null;
    // Cursor-paginated batch loop (avoids loading the full set in memory)
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const rows: Array<{ id: string; userId: string | null; entityType: string | null; entityId: string | null; details: string | null }> = await tx.actionLog.findMany({
        where: { OR: orFilters, ...(lastId ? { id: { gt: lastId } } : {}) },
        orderBy: { id: 'asc' },
        take: BATCH,
        select: { id: true, userId: true, entityType: true, entityId: true, details: true },
      });
      if (rows.length === 0) break;

      for (const row of rows) {
        let nextDetails: string | null = row.details;
        const isSubject =
          row.userId === targetUserId ||
          (row.entityType === 'User' && row.entityId === targetUserId);

        if (row.details) {
          // 1) Typed scrub when user is the subject: parse + null-out PII keys
          if (isSubject) {
            try {
              const parsed = JSON.parse(row.details);
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const scrubbed = { ...(parsed as Record<string, unknown>) };
                let touched = false;
                for (const k of PII_KEYS) {
                  if (k in scrubbed) {
                    scrubbed[k] = ANON;
                    touched = true;
                  }
                }
                if (touched) nextDetails = JSON.stringify(scrubbed);
              }
            } catch {
              // not JSON or not an object — fall through to string replace
            }
          }
          // 2) Best-effort string replace: scrub literal email/phone/name
          //    occurrences anywhere in the JSON string (handles nested metadata).
          if (nextDetails) {
            let s = nextDetails;
            if (oldEmail) s = s.split(oldEmail).join(ANON);
            if (oldPhone) s = s.split(oldPhone).join(ANON);
            if (oldName && oldName.length >= 3) s = s.split(oldName).join(ANON);
            nextDetails = s;
          }
        }

        if (nextDetails !== row.details) {
          await tx.actionLog.update({
            where: { id: row.id },
            data: { details: nextDetails },
          });
        }
        lastId = row.id;
      }

      if (rows.length < BATCH) break;
    }
  });

  } catch (error) {
    await log('error', 'user-anonymize', 'Anonymization failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }

  await logAction({
    userId: session.user.id,
    action: 'RGPD_ANONYMIZE',
    entityType: 'User',
    entityId: targetUserId,
    details: { selfAnonymize: !isAdminFlow },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
