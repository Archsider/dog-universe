#!/usr/bin/env node
// Seed script — creates the walk-in client Stephanie Yanik + her dog Mama
// as a permanent resident.
//
// Idempotent : safe to run multiple times.  If Stephanie already exists
// (matched by deterministic email), the script reuses her row.  Same for
// Mama (matched by name + owner).
//
// Usage :
//   node scripts/seed-stephanie-mama.mjs

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Deterministic identifier so re-runs don't create duplicates.
const STEPHANIE_EMAIL = 'stephanie.yanik+walkin@dog-universe.local';

async function main() {
  console.log('🌱  Seeding Stephanie Yanik + Mama (permanent resident)…\n');

  // ── 1. Stephanie Yanik — walk-in client (no portal access) ──────────────
  let stephanie = await prisma.user.findUnique({
    where: { email: STEPHANIE_EMAIL },
    select: { id: true, name: true, isWalkIn: true },
  });

  if (stephanie) {
    console.log(`✓  Stephanie already exists (id=${stephanie.id})`);
  } else {
    stephanie = await prisma.user.create({
      data: {
        email: STEPHANIE_EMAIL,
        name: 'Stephanie Yanik',
        firstName: 'Stephanie',
        lastName: 'Yanik',
        role: 'CLIENT',
        isWalkIn: true,
        // No password — admin-managed only, no portal login.  We seed a
        // random non-loginable value to keep the NOT NULL constraint happy.
        passwordHash: 'walkin-no-login-' + Math.random().toString(36).slice(2),
      },
      select: { id: true, name: true, isWalkIn: true },
    });
    console.log(`✓  Stephanie created (id=${stephanie.id})`);
  }

  // ── 2. Mama — Stephanie's dog, permanent resident ──────────────────────
  let mama = await prisma.pet.findFirst({
    where: {
      ownerId: stephanie.id,
      name: 'Mama',
      deletedAt: null,
    },
    select: { id: true, name: true, isPermanentResident: true },
  });

  if (mama) {
    console.log(`✓  Mama already exists (id=${mama.id})`);
    // Ensure flags are set correctly even if the row pre-existed.
    if (!mama.isPermanentResident) {
      await prisma.pet.update({
        where: { id: mama.id },
        data: { isPermanentResident: true },
      });
      console.log(`✓  Mama flagged as permanent resident`);
    }
  } else {
    mama = await prisma.pet.create({
      data: {
        ownerId: stephanie.id,
        name: 'Mama',
        species: 'DOG',
        gender: 'FEMALE',
        isNeutered: true,
        microchipNumber: null,                    // microchipped but number TBD
        notes: 'Blanche avec taches marron. Stérilisée, identifiée (puce électronique). Résidente permanente — vit à vie à Dog Universe.',
        isPermanentResident: true,
      },
      select: { id: true, name: true, isPermanentResident: true },
    });
    console.log(`✓  Mama created (id=${mama.id}, permanent=${mama.isPermanentResident})`);
  }

  console.log('\n✅  Seed complete.\n');
  console.log(`    Stephanie : /admin/clients/${stephanie.id}`);
  console.log(`    Mama       : /admin/animals/${mama.id}\n`);
}

main()
  .catch((err) => {
    console.error('❌  Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
