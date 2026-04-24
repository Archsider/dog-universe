import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { sendSMS } from '@/lib/sms';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.doguniverse.ma';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '');

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const unsigned = await prisma.user.findMany({
    where: { role: 'CLIENT', contract: null },
    select: { id: true, name: true, email: true, language: true, phone: true },
  });

  let sent = 0;
  for (const client of unsigned) {
    try {
      const locale = client.language ?? 'fr';
      const loginUrl = `${APP_URL}/${locale}/auth/login`;
      const { subject, html } = getEmailTemplate(
        'contract_reminder',
        { clientName: client.name ?? client.email, loginUrl },
        locale
      );
      await sendEmail({ to: client.email, subject, html });

      // SMS rappel contrat — premium tone (additif, échec ne bloque pas)
      if (client.phone) {
        const firstName = (client.name ?? '').split(' ')[0] || (client.name ?? '');
        await sendSMS(
          client.phone,
          `Bonjour ${firstName}, votre contrat Dog Universe est en attente de signature. Connectez-vous sur votre espace client pour finaliser votre dossier. — Dog Universe`,
        );
      }
      sent++;
    } catch (e) {
      console.error(`contract-reminders cron: failed for ${client.email}:`, e);
    }
  }

  console.log(`contract-reminders cron: sent ${sent}/${unsigned.length}`);
  return NextResponse.json({ sent, total: unsigned.length });
}
