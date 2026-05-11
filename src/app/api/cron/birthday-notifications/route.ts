import { parseMetadata } from '@/lib/notifications/metadata';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { enqueueSms } from '@/lib/queues';
import { defineCron } from '@/lib/cron-runner';

export const maxDuration = 60;

// GET /api/cron/birthday-notifications
// Called daily by Vercel Cron (see vercel.json) or any cron scheduler.
// Protected by CRON_SECRET environment variable via Authorization: Bearer header.
export const GET = defineCron({
  name: 'birthday-notifications',
  period: 'daily',
  fn: async ({ now }) => {
    const month = now.getMonth() + 1; // 1-12
    const day = now.getDate();

    // Leap year edge case: pets born on Feb 29 only have a real birthday every 4 years.
    // In non-leap years, we send their birthday notification on Feb 28 instead.
    const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const includeFeb29 = month === 2 && day === 28 && !isLeapYear(now.getFullYear());

    // Prisma doesn't have MONTH()/DAY() helpers — use raw query.
    // JOIN avec User pour ramener nom + téléphone owner en 1 seule requête (évite N+1 ensuite).
    //
    // BUG FIX (Sprint 2) : un fragment SQL conditionnel ne peut PAS être interpolé
    // dans un tagged template `prisma.$queryRaw`` — il deviendrait un paramètre lié
    // (string entre quotes), pas un fragment SQL. On utilise `Prisma.sql`` pour
    // composer un fragment, puis on le passe via `prisma.$queryRaw(Prisma.sql`...`)`
    // qui accepte les sous-fragments.
    // Filtre soft-delete : Pet et User doivent être actifs (deletedAt IS NULL).
    const feb29Clause = includeFeb29
      ? Prisma.sql`OR (EXTRACT(MONTH FROM p."dateOfBirth") = 2 AND EXTRACT(DAY FROM p."dateOfBirth") = 29)`
      : Prisma.empty;

    const pets = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        species: string;
        ownerId: string;
        dateOfBirth: Date;
        ownerName: string | null;
        ownerPhone: string | null;
      }>
    >(Prisma.sql`
      SELECT
        p.id, p.name, p.species, p."ownerId", p."dateOfBirth",
        u.name AS "ownerName",
        u.phone AS "ownerPhone"
      FROM "Pet" p
      JOIN "User" u ON u.id = p."ownerId"
      WHERE p."dateOfBirth" IS NOT NULL
        AND p."deletedAt" IS NULL
        AND u."deletedAt" IS NULL
        AND (
          (EXTRACT(MONTH FROM p."dateOfBirth") = ${month} AND EXTRACT(DAY FROM p."dateOfBirth") = ${day})
          ${feb29Clause}
        )
    `);

    if (pets.length === 0) {
      return { sent: 0, message: 'No birthdays today' };
    }

    // Batch dedup: load all PET_BIRTHDAY notifications created today for these owners
    // in a single query, then check in-memory — avoids N findFirst calls.
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const ownerIds = Array.from(new Set(pets.map(p => p.ownerId)));
    const existingBirthdayNotifs = await prisma.notification.findMany({
      where: {
        userId: { in: ownerIds },
        type: 'PET_BIRTHDAY',
        createdAt: { gte: todayStart },
      },
      select: { userId: true, metadata: true },
      take: 1000,
    });
    const alreadySentKeys = new Set<string>();
    for (const n of existingBirthdayNotifs) {
      try {
        const meta = parseMetadata(n.metadata);
        if (typeof meta.petId === 'string') alreadySentKeys.add(`${n.userId}:${meta.petId}`);
      } catch { /* ignore malformed metadata */ }
    }

    // Deduplicate: one notification per owner per birthday pet — process in parallel
    let failures = 0;
    const results = await Promise.all(pets.map(async (pet) => {
      if (alreadySentKeys.has(`${pet.ownerId}:${pet.id}`)) return null;

      const age = now.getFullYear() - new Date(pet.dateOfBirth).getFullYear();
      const speciesFr = pet.species === 'DOG' ? 'chien' : 'chat';
      const speciesEn = pet.species === 'DOG' ? 'dog' : 'cat';

      const ops: Promise<unknown>[] = [
        prisma.notification.create({
          data: {
            userId: pet.ownerId,
            type: 'PET_BIRTHDAY',
            titleFr: `🎂 Joyeux anniversaire ${pet.name} !`,
            titleEn: `🎂 Happy Birthday ${pet.name}!`,
            messageFr: `Votre ${speciesFr} ${pet.name} fête ses ${age} an${age > 1 ? 's' : ''} aujourd'hui ! Pensez à lui faire une petite gâterie 🐾`,
            messageEn: `Your ${speciesEn} ${pet.name} turns ${age} today! Don't forget to give them a little treat 🐾`,
            metadata: JSON.stringify({ petId: pet.id, age }),
          },
        }),
      ];

      if (pet.ownerPhone) {
        const ownerFirstName = (pet.ownerName ?? '').split(' ')[0] || (pet.ownerName ?? '');
        ops.push(enqueueSms(
          {
            to: pet.ownerPhone,
            message: `Bonjour ${ownerFirstName} ! 🎂 Toute l'équipe Dog Universe souhaite un merveilleux anniversaire à ${pet.name} qui fête ses ${age} an(s) aujourd'hui ! — Dog Universe ❤️`,
          },
          `birthday:${pet.id}:${todayStart.toISOString().slice(0, 10)}`,
        ));
      }

      const settled = await Promise.allSettled(ops);
      for (const s of settled) if (s.status === 'rejected') failures++;
      return pet.id;
    }));

    const created = results.filter((id): id is string => id !== null);
    return { sent: created.length, failures, petIds: created };
  },
});
