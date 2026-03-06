import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key || token !== key) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: string[] = [];

  // 1. Force admin@doguniverse.ma to SUPERADMIN
  const admin = await prisma.user.findUnique({ where: { email: 'admin@doguniverse.ma' } });
  if (admin) {
    await prisma.user.update({ where: { email: 'admin@doguniverse.ma' }, data: { role: 'SUPERADMIN' } });
    results.push(`✓ admin@doguniverse.ma → SUPERADMIN`);
  } else {
    results.push(`✗ admin@doguniverse.ma introuvable`);
  }

  // 2. Delete khtabe.mehdi@gmail.com completely
  const toDelete = await prisma.user.findUnique({ where: { email: 'khtabe.mehdi@gmail.com' } });
  if (toDelete) {
    const id = toDelete.id;
    await prisma.notification.deleteMany({ where: { userId: id } });
    await prisma.actionLog.deleteMany({ where: { userId: id } });
    await prisma.adminNote.deleteMany({ where: { createdBy: id } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: id } });
    await prisma.benefitClaim.deleteMany({ where: { clientId: id } });
    await prisma.loyaltyGrade.deleteMany({ where: { clientId: id } });
    await prisma.bookingPet.deleteMany({ where: { booking: { clientId: id } } });
    await prisma.invoice.deleteMany({ where: { clientId: id } });
    await prisma.booking.deleteMany({ where: { clientId: id } });
    await prisma.pet.deleteMany({ where: { ownerId: id } });
    await prisma.user.delete({ where: { id } });
    results.push(`✓ khtabe.mehdi@gmail.com supprimé`);
  } else {
    results.push(`⚠ khtabe.mehdi@gmail.com déjà supprimé`);
  }

  // 3. Show all current admins
  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPERADMIN'] } },
    select: { email: true, name: true, role: true },
  });

  return NextResponse.json({ results, admins });
}
