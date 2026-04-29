// RGPD Article 20 (right to data portability) — user-triggered export.
// Returns a JSON snapshot of all personal data linked to the authenticated
// user. Logged via RGPD_EXPORT for audit traceability.
import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Admins use the admin export tools; this endpoint is for clients managing
  // their own data. Refuse anything else to keep the contract narrow.
  if (session.user.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = session.user.id;

  const [user, pets, bookings, invoices, notifications, loyaltyGrade, claims, contract] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, email: true, name: true, phone: true, language: true,
          createdAt: true, updatedAt: true,
          historicalStays: true, historicalSpendMAD: true, historicalNote: true,
          anonymizedAt: true,
        },
      }),
      prisma.pet.findMany({
        where: { ownerId: userId },
        include: {
          vaccinations: { select: { id: true, vaccineType: true, date: true, nextDueDate: true, comment: true } },
          documents: { select: { id: true, name: true, fileType: true, uploadedAt: true } },
        },
      }),
      prisma.booking.findMany({
        where: { clientId: userId },
        include: {
          bookingPets: { select: { petId: true, pet: { select: { name: true, species: true } } } },
          boardingDetail: true,
          taxiDetail: true,
        },
        orderBy: { startDate: 'desc' },
      }),
      prisma.invoice.findMany({
        where: { clientId: userId },
        include: { items: true },
        orderBy: { issuedAt: 'desc' },
      }),
      prisma.notification.findMany({
        where: { userId },
        select: {
          id: true, type: true, titleFr: true, titleEn: true,
          messageFr: true, messageEn: true, read: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.loyaltyGrade.findUnique({ where: { clientId: userId } }),
      prisma.loyaltyBenefitClaim.findMany({
        where: { clientId: userId },
        select: {
          id: true, grade: true, benefitKey: true, status: true,
          rejectionReason: true, claimedAt: true, reviewedAt: true,
        },
        orderBy: { claimedAt: 'desc' },
      }),
      prisma.clientContract.findUnique({
        where: { clientId: userId },
        select: { id: true, signedAt: true, version: true, ipAddress: true },
      }),
    ]);

  if (!user) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await logAction({
    userId,
    action: LOG_ACTIONS.RGPD_EXPORT,
    entityType: 'User',
    entityId: userId,
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
    details: {
      counts: {
        pets: pets.length,
        bookings: bookings.length,
        invoices: invoices.length,
        notifications: notifications.length,
        claims: claims.length,
      },
    },
  });

  return new NextResponse(
    JSON.stringify({
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      user,
      pets,
      bookings,
      invoices,
      notifications,
      loyaltyGrade,
      benefitClaims: claims,
      contract,
    }, null, 2),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="dog-universe-export-${userId}.json"`,
        'Cache-Control': 'no-store',
      },
    },
  );
}
