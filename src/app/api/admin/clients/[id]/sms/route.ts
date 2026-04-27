import { NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { sendSMS, formatMAD } from '@/lib/sms';
import { logAction } from '@/lib/log';

type SmsType = 'INCOMPLETE_FILE' | 'MISSING_VACCINES' | 'CONTRACT_REMINDER' | 'INVOICE_AVAILABLE';
const VALID_TYPES: SmsType[] = ['INCOMPLETE_FILE', 'MISSING_VACCINES', 'CONTRACT_REMINDER', 'INVOICE_AVAILABLE'];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { type, note, invoiceId } = body as { type?: string; note?: string; invoiceId?: string };

  if (!type || !VALID_TYPES.includes(type as SmsType)) {
    return NextResponse.json({ error: 'INVALID_TYPE' }, { status: 400 });
  }

  const client = await prisma.user.findUnique({
    where: { id: id },
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
  const firstName = (client.name ?? '').split(' ')[0] || (client.name ?? '');
  let message = '';
  let invoiceNumber: string | undefined;

  if (type === 'INCOMPLETE_FILE') {
    // Récupère le premier animal du client pour personnaliser le message
    const pet = await prisma.pet.findFirst({
      where: { ownerId: id },
      select: { name: true },
      orderBy: { createdAt: 'asc' },
    });
    const petName = pet?.name ?? 'votre animal';
    const suffix = cleanNote ? ` : ${cleanNote}` : '';
    message = `Bonjour ${firstName}, le dossier de ${petName} est incomplet. Merci de régulariser${suffix}. — Dog Universe`;
  } else if (type === 'MISSING_VACCINES') {
    const petLabel = cleanNote || 'votre animal';
    message = `Bonjour ${firstName}, le dossier de ${petLabel} est incomplet : justificatifs vaccinaux manquants. Merci de régulariser rapidement. — Dog Universe`;
  } else if (type === 'CONTRACT_REMINDER') {
    message = `Bonjour ${firstName}, votre contrat Dog Universe est en attente de signature. Connectez-vous sur votre espace client pour finaliser votre dossier. — Dog Universe`;
  } else {
    // INVOICE_AVAILABLE
    if (!invoiceId || typeof invoiceId !== 'string') {
      return NextResponse.json({ error: 'INVOICE_ID_REQUIRED' }, { status: 400 });
    }
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { invoiceNumber: true, amount: true, status: true, clientId: true },
    });
    if (!invoice) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (invoice.clientId !== id) {
      return NextResponse.json({ error: 'INVOICE_MISMATCH' }, { status: 400 });
    }
    if (invoice.status === 'CANCELLED') {
      return NextResponse.json({ error: 'INVOICE_CANCELLED' }, { status: 400 });
    }
    invoiceNumber = invoice.invoiceNumber;
    message = `Bonjour ${firstName}, votre facture ${invoice.invoiceNumber} d'un montant de ${formatMAD(invoice.amount)} est disponible sur votre espace client. — Dog Universe 🐾`;
  }

  const ok = await sendSMS(client.phone, message);

  await logAction({
    userId: session.user.id,
    action: 'SMS_SENT',
    entityType: 'User',
    entityId: id,
    details: { type, message, delivered: ok, ...(invoiceId ? { invoiceId } : {}), ...(invoiceNumber ? { invoiceNumber } : {}) },
  });

  if (!ok) {
    return NextResponse.json({ error: 'SMS_GATEWAY_FAILED' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, type });
}
