import { NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { sendSMS } from '@/lib/sms';
import { logAction } from '@/lib/log';

type SmsType = 'INCOMPLETE_FILE' | 'MISSING_VACCINES' | 'CONTRACT_REMINDER';
const VALID_TYPES: SmsType[] = ['INCOMPLETE_FILE', 'MISSING_VACCINES', 'CONTRACT_REMINDER'];

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { type, note } = body as { type?: string; note?: string };

  if (!type || !VALID_TYPES.includes(type as SmsType)) {
    return NextResponse.json({ error: 'INVALID_TYPE' }, { status: 400 });
  }

  const client = await prisma.user.findUnique({
    where: { id: params.id },
    select: { name: true, phone: true, isWalkIn: true, role: true },
  });

  if (!client || client.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (client.isWalkIn) {
    return NextResponse.json({ error: 'WALK_IN_NOT_ALLOWED' }, { status: 400 });
  }
  if (!client.phone) {
    return NextResponse.json({ error: 'NO_PHONE' }, { status: 400 });
  }

  const cleanNote = typeof note === 'string' ? note.trim().slice(0, 200) : '';
  let message = '';

  if (type === 'INCOMPLETE_FILE') {
    const suffix = cleanNote ? ' : ' + cleanNote : '';
    message = `Bonjour ${client.name} ! Votre dossier chez Dog Universe nécessite votre attention${suffix}. Merci de nous contacter. — Dog Universe`;
  } else if (type === 'MISSING_VACCINES') {
    const petLabel = cleanNote || 'votre animal';
    message = `Bonjour ${client.name} ! Le dossier de ${petLabel} est incomplet : justificatifs vaccinaux manquants. Merci de régulariser rapidement. — Dog Universe`;
  } else {
    message = `Bonjour ${client.name} ! Il vous reste à signer votre contrat Dog Universe. Connectez-vous sur votre espace client pour le finaliser. Des questions ? Appelez-nous. — Dog Universe`;
  }

  const ok = await sendSMS(client.phone, message);

  await logAction({
    userId: session.user.id,
    action: 'SMS_SENT',
    entityType: 'User',
    entityId: params.id,
    details: { type, message, delivered: ok },
  });

  if (!ok) {
    return NextResponse.json({ error: 'SMS_GATEWAY_FAILED' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, type });
}
