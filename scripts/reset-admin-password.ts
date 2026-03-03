/**
 * Script de réinitialisation du mot de passe admin
 * Usage: npx ts-node scripts/reset-admin-password.ts
 */
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
    process.exit(1);
  }

  const hash = await bcrypt.hash(NEW_PASSWORD, 12);
  await prisma.user.update({
    where: { email: ADMIN_EMAIL },
    data: { passwordHash: hash },
  });

  console.log(`✅ Mot de passe réinitialisé avec succès !`);
  console.log(`\n   Email    : ${ADMIN_EMAIL}`);
  console.log(`   Mot de passe : ${NEW_PASSWORD}`);
  console.log(`\n⚠️  Change ce mot de passe après connexion.\n`);
}

main()
  .catch((e) => {
    console.error('❌ Erreur :', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
