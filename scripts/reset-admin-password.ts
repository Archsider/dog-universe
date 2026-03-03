/**
 * Script de réinitialisation du mot de passe admin
 * Usage: npx tsx scripts/reset-admin-password.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local manually since Prisma CLI only reads .env
try {
  const envPath = resolve(process.cwd(), '.env.local');
  const envFile = readFileSync(envPath, 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env.local not found, continue with existing env vars
}

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@doguniverse.ma';
const NEW_PASSWORD = 'DogUniverse2024!';

async function main() {
  console.log(`\n🔑 Réinitialisation du mot de passe pour : ${ADMIN_EMAIL}`);

  const user = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (!user) {
    console.error(`❌ Aucun utilisateur trouvé avec l'email : ${ADMIN_EMAIL}`);
    console.log(`\n💡 Création du compte admin...`);

    const hash = await bcrypt.hash(NEW_PASSWORD, 12);
    await prisma.user.create({
      data: {
        name: 'Admin',
        email: ADMIN_EMAIL,
        passwordHash: hash,
        role: 'ADMIN',
        language: 'fr',
      },
    });
    console.log(`✅ Compte admin créé !`);
  } else {
    const hash = await bcrypt.hash(NEW_PASSWORD, 12);
    await prisma.user.update({
      where: { email: ADMIN_EMAIL },
      data: { passwordHash: hash },
    });
    console.log(`✅ Mot de passe réinitialisé avec succès !`);
  }

  console.log(`\n   Email        : ${ADMIN_EMAIL}`);
  console.log(`   Mot de passe : ${NEW_PASSWORD}`);
  console.log(`\n⚠️  Change ce mot de passe après connexion.\n`);
}

main()
  .catch((e) => {
    console.error('❌ Erreur :', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
