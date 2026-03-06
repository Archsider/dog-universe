import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// One-time maintenance route — protected by service role key
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key || token !== key) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return handleMaintenance();
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key || authHeader !== `Bearer ${key}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return handleMaintenance();
}

async function handleMaintenance() {

  const results: string[] = [];

  // 1. Delete khtabe.mehd@gmail.com and all their data
  const toDelete = await prisma.user.findUnique({
    where: { email: 'khtabe.mehdi@gmail.com' },
    include: {
      pets: { include: { bookingPets: true } },
      bookings: true,
      invoices: true,
      notifications: true,
      actionLogs: true,
      adminNotes: true,
      passwordResets: true,
      benefitClaims: true,
      loyaltyGrade: true,
    },
  });

  if (toDelete) {
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { userId: toDelete.id } }),
      prisma.actionLog.deleteMany({ where: { userId: toDelete.id } }),
      prisma.adminNote.deleteMany({ where: { createdBy: toDelete.id } }),
      prisma.passwordResetToken.deleteMany({ where: { userId: toDelete.id } }),
      prisma.benefitClaim.deleteMany({ where: { clientId: toDelete.id } }),
      prisma.loyaltyGrade.deleteMany({ where: { clientId: toDelete.id } }),
      prisma.bookingPet.deleteMany({ where: { booking: { clientId: toDelete.id } } }),
      prisma.invoice.deleteMany({ where: { clientId: toDelete.id } }),
      prisma.booking.deleteMany({ where: { clientId: toDelete.id } }),
      prisma.pet.deleteMany({ where: { ownerId: toDelete.id } }),
      prisma.user.delete({ where: { id: toDelete.id } }),
    ]);
    results.push(`✓ Compte khtabe.mehdi@gmail.com supprimé`);
  } else {
    results.push(`⚠ khtabe.mehdi@gmail.com introuvable`);
  }

  // 2. Promote admin@doguniverse.ma to SUPERADMIN
  const doguser = await prisma.user.findUnique({
    where: { email: 'admin@doguniverse.ma' },
    select: { id: true, email: true, name: true, role: true },
  });

  if (doguser) {
    await prisma.user.update({
      where: { id: doguser.id },
      data: { role: 'SUPERADMIN' },
    });
    results.push(`✓ ${doguser.email} promu SUPERADMIN`);
  } else {
    results.push(`⚠ Aucun compte @doguniverse trouvé`);
  }

  // 3. List current admins/superadmins
  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPERADMIN'] } },
    select: { email: true, name: true, role: true },
  });

  return NextResponse.json({ results, admins });
}
