import { NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { content, entityType = 'CLIENT', entityId } = await request.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: 'MISSING_CONTENT' }, { status: 400 });
  }
  if (content.length > 10000) {
    return NextResponse.json({ error: 'CONTENT_TOO_LONG' }, { status: 400 });
  }
  const VALID_ENTITY_TYPES = ['CLIENT', 'PET'];
  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    return NextResponse.json({ error: 'INVALID_ENTITY_TYPE' }, { status: 400 });
  }

  if (entityType === 'PET') {
    if (!entityId) {
      return NextResponse.json({ error: 'MISSING_ENTITY_ID' }, { status: 400 });
    }
    const pet = await prisma.pet.findFirst({ where: { id: entityId, ownerId: id } });
    if (!pet) {
      return NextResponse.json({ error: 'PET_NOT_FOUND' }, { status: 404 });
    }
  }

  const note = await prisma.adminNote.create({
    data: {
      entityType,
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
