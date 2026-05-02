import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { generateTotpSecret, getTotpQRCodeDataURL } from '@/lib/totp';

export async function POST() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpSecret: secret }, // totpEnabled reste false jusqu'à verify-setup
  });

  const qrCodeDataURL = await getTotpQRCodeDataURL(secret, session.user.email ?? '');
  return NextResponse.json({ qrCodeDataURL });
}
