import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail, getEmailTemplate } from '@/lib/email';

const LOGIN_URL = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/fr/auth/login`
  : 'https://doguniverse.ma/fr/auth/login';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '');

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const unsigned = await prisma.user.findMany({
    where: { role: 'CLIENT', contract: null },
    select: { id: true, name: true, email: true, language: true },
  });

  let sent = 0;
  for (const client of unsigned) {
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
      console.error(`contract-reminders cron: failed for ${client.email}:`, e);
    }
  }

  console.log(`contract-reminders cron: sent ${sent}/${unsigned.length}`);
  return NextResponse.json({ sent, total: unsigned.length });
}
