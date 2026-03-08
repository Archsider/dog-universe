import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/cron/birthday-notifications
// Called daily by Vercel Cron (see vercel.json) or any cron scheduler.
// Protected by CRON_SECRET environment variable via Authorization: Bearer header.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find all pets born today (day + month match regardless of year)
  const today = new Date();
  const month = today.getMonth() + 1; // 1-12
  const day = today.getDate();

  // Prisma doesn't have MONTH()/DAY() helpers — use raw query
  const pets = await prisma.$queryRaw<
    { id: string; name: string; species: string; ownerId: string; dateOfBirth: Date }[]
  >`
    SELECT id, name, species, "ownerId", "dateOfBirth"
    FROM "Pet"
    WHERE "dateOfBirth" IS NOT NULL
      AND EXTRACT(MONTH FROM "dateOfBirth") = ${month}
      AND EXTRACT(DAY FROM "dateOfBirth") = ${day}
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
    created.push(pet.id);
  }

  return NextResponse.json({ sent: created.length, petIds: created });
}
