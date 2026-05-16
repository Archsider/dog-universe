import { prisma } from '@/lib/prisma';
import { startOfTodayCasa, endOfTodayCasa } from '@/lib/dates-casablanca';
import { getCapacityLimits, countOverlappingPets } from '@/lib/capacity';
import type { PensionSnapshot } from '../shapes';

export async function loadPension(): Promise<PensionSnapshot> {
  // IN_PROGRESS strict, per Mehdi's brief : reflects the physical state of
  // the kennel (admin flips status manually at check-in). A CONFIRMED
  // overlapping today but not yet checked-in shows up in the "Aujourd'hui"
  // arrivals card instead — we don't double-count.
  const todayStart = startOfTodayCasa();
  const todayEnd = endOfTodayCasa();
  const [limits, dogsIn, catsIn] = await Promise.all([
    getCapacityLimits(),
    countOverlappingPets('DOG', { startDate: todayStart, endDate: todayEnd }),
    countOverlappingPets('CAT', { startDate: todayStart, endDate: todayEnd }),
  ]);
  // countOverlappingPets includes all ACTIVE_STATUSES (PENDING / CONFIRMED /
  // IN_PROGRESS) by design — for "Pension actuelle" we need IN_PROGRESS
  // strict, so we re-query directly. Simpler than parameterising the lib.
  const inProgress = await prisma.booking.findMany({
    where: {
      serviceType: 'BOARDING',
      status: 'IN_PROGRESS',
      deletedAt: null,
    },
    select: {
      bookingPets: {
        select: { pet: { select: { species: true } } },
      },
    },
  });
  let dogs = 0;
  let cats = 0;
  for (const b of inProgress) {
    for (const bp of b.bookingPets) {
      if (!bp.pet) continue;
      if (bp.pet.species === 'DOG') dogs++;
      else if (bp.pet.species === 'CAT') cats++;
    }
  }
  // dogsIn / catsIn from the lib are unused here but keep the call to
  // warm the Setting cache for the 7-day chart below (single round-trip).
  void dogsIn;
  void catsIn;
  return {
    dogsIn: dogs,
    catsIn: cats,
    dogsLimit: limits.dogs,
    catsLimit: limits.cats,
  };
}
