import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { upcomingBirthdays, type UpcomingBirthday } from '../helpers';

export async function loadBirthdays(): Promise<UpcomingBirthday[]> {
  // Cheapest path : pull every non-deleted pet with a DOB and filter in
  // JS. The total pet count is tiny (≤ a few hundred) ; saves a raw SQL
  // EXTRACT(MONTH) trip and keeps the helper pure-testable.
  const pets = await prisma.pet.findMany({
    where: notDeleted({
      dateOfBirth: { not: null },
      // Walk-in pets often have sparse profiles ; exclude their owners
      // from anniversary surfacing — they aren't recurring relationships.
      owner: notDeleted({ isWalkIn: false }),
    }),
    select: {
      id: true,
      name: true,
      dateOfBirth: true,
      owner: { select: { name: true } },
    },
  });
  return upcomingBirthdays(pets);
}
