// RGPD data export — droit d'accès (loi 09-08 + art. 15 RGPD).
// Returns a JSON download containing all data the user has on the platform.
//
// Auth:
//   - CLIENT  → exports their own data (session.user.id only)
//   - SUPERADMIN → may pass ?userId= to export any user (audit logged)
//
// Rate limit: 3 exports / day / userId (Redis-backed, fail-open).
//
// Excluded from export (internal / security): passwordHash, tokenVersion,
// ActionLog, AdminNote, contract storage URLs (private bucket keys leaked
// to a self-export would still let nobody download — bucket is private).
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';
import { consumeExportSlot } from '@/lib/rgpd';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Determine target user
  const { searchParams } = new URL(request.url);
  const queryUserId = searchParams.get('userId');
  let targetUserId = session.user.id;
  if (queryUserId && queryUserId !== session.user.id) {
    if (session.user.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    targetUserId = queryUserId;
  }

  // Rate limit per target user (a SUPERADMIN exporting 50 clients still
  // hits the per-target limit, not their own)
  const slot = await consumeExportSlot(targetUserId);
  if (!slot.ok) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSeconds: slot.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(slot.retryAfterSeconds) } },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true, name: true, email: true, phone: true, language: true,
      createdAt: true, updatedAt: true, anonymizedAt: true,
      historicalStays: true, historicalSpendMAD: true,
    },
  });
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [pets, bookings, invoices, loyaltyGrade, notifications, contract] = await Promise.all([
    prisma.pet.findMany({
      where: { ownerId: targetUserId },
      select: {
        id: true, name: true, species: true, breed: true, dateOfBirth: true,
        gender: true, isNeutered: true, weight: true,
        microchipNumber: true, tattooNumber: true,
        allergies: true, currentMedication: true,
        notes: true, createdAt: true, deletedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.booking.findMany({
      where: { clientId: targetUserId, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
      select: {
        id: true, serviceType: true, status: true,
        startDate: true, endDate: true, arrivalTime: true,
        totalPrice: true, cancellationReason: true, createdAt: true,
        bookingPets: { select: { pet: { select: { name: true } } } },
      },
      orderBy: { startDate: 'desc' },
    }),
    prisma.invoice.findMany({
      where: { clientId: targetUserId },
      select: {
        invoiceNumber: true, amount: true, paidAmount: true, status: true,
        serviceType: true, issuedAt: true, paidAt: true,
      },
      orderBy: { issuedAt: 'desc' },
    }),
    prisma.loyaltyGrade.findUnique({
      where: { clientId: targetUserId },
      select: { grade: true, isOverride: true, createdAt: true, updatedAt: true },
    }),
    prisma.notification.findMany({
      where: { userId: targetUserId },
      select: {
        type: true, titleFr: true, titleEn: true, messageFr: true, messageEn: true,
        read: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.clientContract.findUnique({
      where: { clientId: targetUserId },
      select: { signedAt: true, version: true },
    }),
  ]);

  const totalSpentMAD = invoices
    .filter((i) => i.status === 'PAID')
    .reduce((sum, i) => sum + i.amount, 0);

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    notice:
      'Conformément à la loi 09-08 (Maroc) et au RGPD (art. 15), ce document contient l\'ensemble des données personnelles vous concernant détenues par Dog Universe. Format : JSON.',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      language: user.language,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      anonymizedAt: user.anonymizedAt,
    },
    historicalBaseline: {
      stays: user.historicalStays,
      spendMAD: user.historicalSpendMAD,
    },
    pets: pets.map((p) => ({
      ...p,
    })),
    bookings: bookings.map((b) => ({
      ref: b.id.slice(0, 8).toUpperCase(),
      service: b.serviceType,
      status: b.status,
      startDate: b.startDate,
      endDate: b.endDate,
      arrivalTime: b.arrivalTime,
      totalPriceMAD: b.totalPrice,
      cancellationReason: b.cancellationReason,
      createdAt: b.createdAt,
      pets: b.bookingPets.map((bp) => bp.pet.name),
    })),
    invoices: invoices.map((i) => ({
      ref: i.invoiceNumber,
      amountMAD: i.amount,
      paidAmountMAD: i.paidAmount,
      status: i.status,
      service: i.serviceType,
      issuedAt: i.issuedAt,
      paidAt: i.paidAt,
    })),
    loyaltyGrade: loyaltyGrade
      ? { ...loyaltyGrade, totalStays: bookings.filter((b) => b.status === 'COMPLETED').length, totalSpentMAD }
      : null,
    notifications,
    contract,
  };

  // Audit trail — separate from rate-limit so failures here don't block the export.
  await logAction({
    userId: session.user.id,
    action: 'RGPD_EXPORT',
    entityType: 'User',
    entityId: targetUserId,
    details: { selfExport: targetUserId === session.user.id },
  }).catch(() => {});

  const filename = `doguniverse-export-${targetUserId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
