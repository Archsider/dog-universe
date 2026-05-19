/**
 * Auto-merge logic for contiguous BOARDING bookings.
 *
 * When a new BOARDING booking starts the day after an existing one ends
 * (same client, same pet(s)), we extend the existing booking instead of
 * creating a duplicate.
 */
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { checkBoardingCapacity, type CapacityCheckExceeded } from '@/lib/capacity';
import { getPricingSettings, calculateBoardingTotalForExtension } from '@/lib/pricing';
import { logAction } from '@/lib/log';
import { runWithSerializableRetry } from '@/lib/services/booking-client.service';
import { invalidateAvailabilityCache } from '@/lib/availability-cache';

export interface AutoMergeArgs {
  clientId: string;
  petIds: string[];
  startDate: string;
  endDate: string;
  userId: string; // for logAction
}

export type AutoMergeResponse =
  | { merged: true; response: ReturnType<typeof NextResponse.json> }
  | { merged: false; capacityError: CapacityCheckExceeded | null };

export async function tryAutoMerge(args: AutoMergeArgs): Promise<AutoMergeResponse> {
  const newStart = new Date(args.startDate);
  // Casa-anchored "day before" window — `setUTCHours(0,0,0,0)` shifts to
  // UTC midnight, which is 01:00 Casa.  A booking with endDate Casa
  // 23:30 (= 22:30 UTC) would otherwise miss this window and trigger a
  // duplicate booking instead of an extension.
  const { startOfDayCasa, endOfDayCasa } = await import('@/lib/dates-casablanca');
  const dayBeforeMid = new Date(newStart.getTime() - 24 * 60 * 60 * 1000);
  const dayBeforeStart = startOfDayCasa(dayBeforeMid);
  const dayBeforeEnd = endOfDayCasa(dayBeforeMid);

  // Fast-path probe outside the tx — skip the Serializable open if no candidate exists.
  const probe = await prisma.booking.findFirst({
    where: {
      clientId: args.clientId,
      serviceType: 'BOARDING',
      status: { notIn: ['CANCELLED', 'REJECTED', 'COMPLETED'] },
      endDate: { gte: dayBeforeStart, lte: dayBeforeEnd },
      bookingPets: { some: { petId: { in: args.petIds } } },
      ...notDeleted(),
    },
    select: { id: true },
  });

  if (!probe) {
    return { merged: false, capacityError: null };
  }

  const pricingForMerge = await getPricingSettings();
  let mergeCapacityError: CapacityCheckExceeded | null = null;

  type MergeResult = {
    merged: NonNullable<Awaited<ReturnType<typeof prisma.booking.findFirst>>> & {
      invoice: Awaited<ReturnType<typeof prisma.invoice.findFirst>> | null;
      boardingDetail: Awaited<ReturnType<typeof prisma.boardingDetail.findFirst>> | null;
      bookingPets: Array<{ pet: { id: string; name: string; species: string } }>;
      client: { name: string | null; email: string };
    };
    mergedTotal: number;
    mergedEndDate: Date;
  } | null;

  let result: MergeResult = null;
  try {
    result = await runWithSerializableRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const existingContiguous = await tx.booking.findFirst({
            where: {
              clientId: args.clientId,
              serviceType: 'BOARDING',
              status: { notIn: ['CANCELLED', 'REJECTED', 'COMPLETED'] },
              endDate: { gte: dayBeforeStart, lte: dayBeforeEnd },
              bookingPets: { some: { petId: { in: args.petIds } } },
              ...notDeleted(),
            },
            include: {
              invoice: true,
              boardingDetail: true,
              bookingPets: { include: { pet: true } },
              client: true,
            },
          });
          if (!existingContiguous) return null;

          const cap = await checkBoardingCapacity(
            {
              petIds: args.petIds,
              startDate: existingContiguous.endDate ?? existingContiguous.startDate,
              endDate: new Date(args.endDate),
              excludeBookingId: existingContiguous.id,
            },
            tx,
          );
          if (!cap.ok) {
            mergeCapacityError = cap;
            return null;
          }

          const mergedEndDate = new Date(args.endDate);
          const mergedNights = Math.floor(
            (mergedEndDate.getTime() - existingContiguous.startDate.getTime()) /
              (1000 * 60 * 60 * 24),
          );
          const mergePets = existingContiguous.bookingPets.map((bp) => bp.pet);
          const mergeGroomingPrice = Number(existingContiguous.boardingDetail?.groomingPrice ?? 0);
          const mergeTaxiAddonPrice = Number(
            existingContiguous.boardingDetail?.taxiAddonPrice ?? 0,
          );
          const mergedTotal = calculateBoardingTotalForExtension(
            mergePets,
            mergedNights,
            mergeGroomingPrice,
            mergeTaxiAddonPrice,
            pricingForMerge,
          );

          if (existingContiguous.invoice) {
            if (existingContiguous.invoice.status === 'PENDING') {
              // eslint-disable-next-line dog-universe/no-direct-invoice-mutation -- OK: auto-merge consolidates a contiguous PENDING invoice's amount when its items get regenerated. PENDING means no payments yet, so allocation re-run is unnecessary. TODO Module 5+ : route through `mergeInvoices()` helper.
              await tx.invoice.update({
                where: { id: existingContiguous.invoice.id },
                data: { amount: mergedTotal },
              });
            } else if (existingContiguous.invoice.status === 'PARTIALLY_PAID') {
              const invoiceUpdate: Record<string, unknown> = { amount: mergedTotal };
              if (Number(existingContiguous.invoice.paidAmount) >= mergedTotal) {
                invoiceUpdate.status = 'PAID';
                invoiceUpdate.paidAt = existingContiguous.invoice.paidAt ?? new Date();
              }
              await tx.invoice.update({
                where: { id: existingContiguous.invoice.id },
                data: invoiceUpdate,
              });
            }
            // If PAID: leave alone — admin handles supplementary invoice manually
          }

          await tx.booking.update({
            where: { id: existingContiguous.id },
            data: {
              endDate: mergedEndDate,
              totalPrice: mergedTotal,
              hasExtensionRequest: false,
              extensionRequestedEndDate: null,
              extensionRequestNote: null,
            },
          });

          return { merged: existingContiguous as never, mergedTotal, mergedEndDate };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 },
      ),
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'CONFLICT_RETRY_EXCEEDED') {
      return {
        merged: true,
        response: NextResponse.json({ error: 'CONFLICT_RETRY_EXCEEDED' }, { status: 503 }),
      };
    }
    throw err;
  }

  if (mergeCapacityError) {
    return { merged: false, capacityError: mergeCapacityError };
  }

  if (result) {
    const { merged, mergedTotal, mergedEndDate } = result;
    const mergedRef = merged.id.slice(0, 8).toUpperCase();
    await logAction({
      userId: args.userId,
      action: 'BOOKING_AUTO_MERGED',
      entityType: 'Booking',
      entityId: merged.id,
      details: {
        mergedEndDate: mergedEndDate.toISOString().slice(0, 10),
        mergedTotal,
        petIds: args.petIds,
      },
    });
    // Cache de disponibilité : couvrir l'ancien intervalle ET la nouvelle date de fin
    // (au cas où le merge étire la booking sur un mois supplémentaire).
    await invalidateAvailabilityCache(merged.startDate, mergedEndDate);
    return {
      merged: true,
      response: NextResponse.json(
        {
          ...merged,
          bookingRef: mergedRef,
          autoMerged: true,
          newEndDate: args.endDate,
          newTotal: mergedTotal,
        },
        { status: 200 },
      ),
    };
  }

  // Candidate disappeared between probe and tx — fall through to normal create.
  return { merged: false, capacityError: null };
}
