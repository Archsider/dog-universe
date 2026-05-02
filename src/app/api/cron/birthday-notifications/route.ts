import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enqueueSms } from '@/lib/queues';
import { acquireCronLock } from '@/lib/cron-lock';

export const maxDuration = 60;

// GET /api/cron/birthday-notifications
// Called daily by Vercel Cron (see vercel.json) or any cron scheduler.
// Protected by CRON_SECRET environment variable via Authorization: Bearer header.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error(JSON.stringify({ level: 'error', service: 'cron-birthday', message: 'CRON_SECRET is not configured — cron endpoint is unprotected', timestamp: new Date().toISOString() }));
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  const providedBuf = Buffer.from(authHeader ?? '');
  const expectedBuf = Buffer.from(`Bearer ${cronSecret}`);
  const authorized = providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Idempotency: short-circuit if the cron already ran today.
  const acquired = await acquireCronLock('birthday-notifications', 23 * 3600, 'daily');
  if (!acquired) {
    return NextResponse.json({ skipped: true, reason: 'already_run' }, { status: 200 });
  }

  // Find all pets born today (day + month match regardless of year)
  const today = new Date();
  const month = today.getMonth() + 1; // 1-12
  const day = today.getDate();

  // Leap year edge case: pets born on Feb 29 only have a real birthday every 4 years.
  // In non-leap years, we send their birthday notification on Feb 28 instead.
  const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const includeFeb29 = month === 2 && day === 28 && !isLeapYear(today.getFullYear());

  // Prisma doesn't have MONTH()/DAY() helpers — use raw query.
  // JOIN avec User pour ramener nom + téléphone owner en 1 seule requête (évite N+1 ensuite).
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
  >`
    SELECT
      p.id, p.name, p.species, p."ownerId", p."dateOfBirth",
      u.name AS "ownerName",
      u.phone AS "ownerPhone"
    FROM "Pet" p
    JOIN "User" u ON u.id = p."ownerId"
    WHERE p."dateOfBirth" IS NOT NULL
      AND (
        (EXTRACT(MONTH FROM p."dateOfBirth") = ${month} AND EXTRACT(DAY FROM p."dateOfBirth") = ${day})
        ${includeFeb29 ? `OR (EXTRACT(MONTH FROM p."dateOfBirth") = 2 AND EXTRACT(DAY FROM p."dateOfBirth") = 29)` : `AND TRUE`}
      )
  `;

  if (pets.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No birthdays today' });
  }

  // Batch dedup: load all PET_BIRTHDAY notifications created today for these owners
  // in a single query, then check in-memory — avoids N findFirst calls.
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const ownerIds = Array.from(new Set(pets.map(p => p.ownerId)));
  const existingBirthdayNotifs = await prisma.notification.findMany({
    where: {
      userId: { in: ownerIds },
      type: 'PET_BIRTHDAY',
      createdAt: { gte: todayStart },
    },
    select: { userId: true, metadata: true },
  });
  const alreadySentKeys = new Set<string>();
  for (const n of existingBirthdayNotifs) {
    try {
      const meta = JSON.parse(n.metadata ?? '{}') as Record<string, unknown>;
      if (typeof meta.petId === 'string') alreadySentKeys.add(`${n.userId}:${meta.petId}`);
    } catch { /* ignore malformed metadata */ }
  }

  // Deduplicate: one notification per owner per birthday pet — process in parallel
  let failures = 0;
  const results = await Promise.all(pets.map(async (pet) => {
    if (alreadySentKeys.has(`${pet.ownerId}:${pet.id}`)) return null;

    const age = today.getFullYear() - new Date(pet.dateOfBirth).getFullYear();
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
  return NextResponse.json({ sent: created.length, failures, petIds: created });
}
