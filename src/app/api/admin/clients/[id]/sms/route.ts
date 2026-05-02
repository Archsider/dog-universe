import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { sendSMS, formatMAD } from '@/lib/sms';
import { logAction } from '@/lib/log';
import { withSchema } from '@/lib/with-schema';

type SmsType = 'INCOMPLETE_FILE' | 'MISSING_VACCINES' | 'CONTRACT_REMINDER' | 'INVOICE_AVAILABLE';

const paramsSchema = z.object({ id: z.string().min(1) });

const smsBodySchema = z.object({
  type: z.enum(['INCOMPLETE_FILE', 'MISSING_VACCINES', 'CONTRACT_REMINDER', 'INVOICE_AVAILABLE']),
  note: z.string().max(2000).optional(),
  invoiceId: z.string().min(1).optional(),
});

export const POST = withSchema(
  { body: smsBodySchema, params: paramsSchema },
  async (_request, { body, params }) => {
    const { id } = params;
    const session = await auth();
    if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { type, note, invoiceId } = body;

    const client = await prisma.user.findFirst({
      where: { id, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
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

    // Strip control chars and Unicode direction/zero-width marks before injection into SMS body
    const rawNote = typeof note === 'string'
      ? note.replace(/[ -​-‏‪-‮]/g, '').trim().slice(0, 300)
      : '';
    if (rawNote && !/^[\p{L}\p{N}\s.,!?()\-]{1,300}$/u.test(rawNote)) {
      return NextResponse.json({ error: 'INVALID_SMS_CONTENT' }, { status: 400 });
    }
    const cleanNote = rawNote;
    const firstName = (client.name ?? '').split(' ')[0] || (client.name ?? '');
    let message = '';
    let invoiceNumber: string | undefined;

    const smsType: SmsType = type;

    if (smsType === 'INCOMPLETE_FILE') {
      // Récupère le premier animal du client pour personnaliser le message
      const pet = await prisma.pet.findFirst({
        where: { ownerId: id, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
        select: { name: true },
        orderBy: { createdAt: 'asc' },
      });
      const petName = pet?.name ?? 'votre animal';
      const suffix = cleanNote ? ` : ${cleanNote}` : '';
      message = `Bonjour ${firstName}, le dossier de ${petName} est incomplet. Merci de régulariser${suffix}. — Dog Universe`;
    } else if (smsType === 'MISSING_VACCINES') {
      const petLabel = cleanNote || 'votre animal';
      message = `Bonjour ${firstName}, le dossier de ${petLabel} est incomplet : justificatifs vaccinaux manquants. Merci de régulariser rapidement. — Dog Universe`;
    } else if (smsType === 'CONTRACT_REMINDER') {
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

    // sendSMS now throws on gateway/timeout/breaker failure — translate to a
     // boolean for the existing 502 response contract.
     const ok = await sendSMS(client.phone, message).catch(() => false);

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
  },
);
