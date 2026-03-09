import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { sendEmail, getEmailTemplate } from '@/lib/email';

const LOGIN_URL = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/fr/auth/login`
  : 'https://doguniverse.ma/fr/auth/login';

// POST /api/admin/contracts/remind
// Body: { clientId?: string } — if omitted, sends to ALL unsigned clients
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { clientId } = await req.json().catch(() => ({}));

  const where = {
    role: 'CLIENT' as const,
    contract: null,
    ...(clientId ? { id: clientId } : {}),
  };

  const clients = await prisma.user.findMany({
    where,
    select: { id: true, name: true, email: true, language: true },
  });

  if (clients.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  let sent = 0;
  for (const client of clients) {
    try {
      const locale = client.language ?? 'fr';
      const { subject, html } = getEmailTemplate(
        'contract_reminder',
        { clientName: client.name ?? client.email, loginUrl: LOGIN_URL },
        locale
      );
      await sendEmail({ to: client.email, subject, html });
      sent++;
    } catch (e) {
      console.error(`Failed to send contract reminder to ${client.email}:`, e);
    }
  }

  return NextResponse.json({ sent });
}
