import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const TARGET_EMAIL = 'khtabe.mehdi@gmail.com';

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: TARGET_EMAIL } });

  if (existing) {
    await prisma.user.update({
      where: { email: TARGET_EMAIL },
      data: { role: 'ADMIN' },
    });
    console.log(`✅ ${TARGET_EMAIL} est maintenant ADMIN`);
  } else {
    const passwordHash = await bcrypt.hash('ChangeMe2024!', 12);
    await prisma.user.create({
      data: {
        email: TARGET_EMAIL,
        name: 'Mehdi Khtabe',
        passwordHash,
        role: 'ADMIN',
        language: 'fr',
      },
    });
    console.log(`✅ Compte ADMIN créé pour ${TARGET_EMAIL}`);
    console.log('   Mot de passe temporaire : ChangeMe2024!');
    console.log('   Change-le via "Mot de passe oublié" après connexion.');
  }
}

main()
  .catch((e) => { console.error('❌ Erreur:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
