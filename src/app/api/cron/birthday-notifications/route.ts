import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendSMS } from '@/lib/sms';
import { acquireCronLock } from '@/lib/cron-lock';

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
  if (authHeader !== `Bearer ${cronSecret}`) {
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
      AND EXTRACT(MONTH FROM p."dateOfBirth") = ${month}
      AND EXTRACT(DAY FROM p."dateOfBirth") = ${day}
  `;

  if (pets.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No birthdays today' });
  }

  // Deduplicate: one notification per owner per birthday pet
  const created: string[] = [];
  for (const pet of pets) {
    const age = today.getFullYear() - new Date(pet.dateOfBirth).getFullYear();
    const speciesFr = pet.species === 'DOG' ? 'chien' : 'chat';
    const speciesEn = pet.species === 'DOG' ? 'dog' : 'cat';

    // Avoid duplicate if we already sent one today for this pet
    // Use specific JSON key-value pattern to avoid partial UUID collisions
    const alreadySent = await prisma.notification.findFirst({
      where: {
        userId: pet.ownerId,
        type: 'PET_BIRTHDAY',
        metadata: { contains: `"petId":"${pet.id}"` },
        createdAt: { gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()) },
      },
    });
    if (alreadySent) continue;

    await prisma.notification.create({
      data: {
        userId: pet.ownerId,
        type: 'PET_BIRTHDAY',
        titleFr: `🎂 Joyeux anniversaire ${pet.name} !`,
        titleEn: `🎂 Happy Birthday ${pet.name}!`,
        messageFr: `Votre ${speciesFr} ${pet.name} fête ses ${age} an${age > 1 ? 's' : ''} aujourd'hui ! Pensez à lui faire une petite gâterie 🐾`,
        messageEn: `Your ${speciesEn} ${pet.name} turns ${age} today! Don't forget to give them a little treat 🐾`,
        metadata: JSON.stringify({ petId: pet.id, age }),
      },
    });

    // SMS anniversaire au propriétaire — données issues du JOIN du $queryRaw (pas de query supplémentaire)
    if (pet.ownerPhone) {
      const ownerFirstName = (pet.ownerName ?? '').split(' ')[0] || (pet.ownerName ?? '');
      await sendSMS(
        pet.ownerPhone,
        `Bonjour ${ownerFirstName} ! 🎂 Toute l'équipe Dog Universe souhaite un merveilleux anniversaire à ${pet.name} qui fête ses ${age} an(s) aujourd'hui ! — Dog Universe ❤️`,
      );
    }

    created.push(pet.id);
  }

  return NextResponse.json({ sent: created.length, petIds: created });
}
