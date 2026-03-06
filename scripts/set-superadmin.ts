/**
 * One-time script to promote a user to SUPERADMIN.
 * Usage: npx tsx scripts/set-superadmin.ts <email>
 *
 * Example: npx tsx scripts/set-superadmin.ts khtabe.mehdi@gmail.com
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx tsx scripts/set-superadmin.ts <email>');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

  if (existing) {
    await prisma.user.update({
      where: { email: existing.email },
      data: { role: 'SUPERADMIN' },
    });
    console.log(`✓ ${existing.email} (${existing.name}) promoted to SUPERADMIN`);
  } else {
    const tempPassword = crypto.randomBytes(16).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        name: 'Super Admin',
        passwordHash,
        role: 'SUPERADMIN',
        language: 'fr',
      },
    });
    console.log(`✓ New SUPERADMIN created: ${user.email}`);
    console.log(`  Temp password: ${tempPassword}`);
    console.log('  Change password immediately after first login.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
