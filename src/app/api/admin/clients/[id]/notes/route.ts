import { NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { content, entityType = 'CLIENT', entityId } = await request.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: 'MISSING_CONTENT' }, { status: 400 });
  }

  const note = await prisma.adminNote.create({
    data: {
      entityType: entityType as string,
      entityId: entityId ?? id,
      content: content.trim(),
      createdBy: session.user.id,
    },
    include: { author: { select: { name: true } } },
  });

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.ADMIN_NOTE_ADDED,
    entityType,
    entityId: entityId ?? id,
  });

  return NextResponse.json(note, { status: 201 });
}
