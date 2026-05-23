import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { contactable } from '@/lib/prisma-soft';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { APP_URL } from '@/lib/config';
import { logger } from '@/lib/logger';

const LOGIN_URL = `${APP_URL}/fr/auth/login`;

// POST /api/admin/contracts/remind
// Body: { clientId?: string } — if omitted, sends to ALL unsigned clients
export async function POST(req: NextRequest) {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;

  const { clientId } = await req.json().catch(() => ({}));

  // contactable() = { deletedAt: null, anonymizedAt: null }. RGPD: never email
  // an anonymized client — they keep a retained/synthetic email but must not be
  // contacted. The cron version already does this; this manual trigger drifted.
  const where = {
    role: 'CLIENT' as const,
    isWalkIn: false, // Walk-in clients have no portal — never invite to sign.
    contract: null,
    ...contactable(),
    ...(clientId ? { id: clientId } : {}),
  };

  const clients = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, email: true, language: true },
    take: 200,
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
      logger.error('admin-contracts', 'Failed to send contract reminder', { clientId: client.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ sent });
}
