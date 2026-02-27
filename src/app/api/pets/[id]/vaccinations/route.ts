import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const pet = await prisma.pet.findUnique({ where: { id } });

  if (!pet) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.user.role !== 'ADMIN' && pet.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { vaccineType, date, comment } = await request.json();

    if (!vaccineType || !date) {
      return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
    }

    const vaccination = await prisma.vaccination.create({
      data: {
        petId: id,
        vaccineType: vaccineType.trim(),
        date: new Date(date),
        comment: comment?.trim() || null,
      },
    });

    return NextResponse.json(vaccination, { status: 201 });
  } catch (error) {
    console.error('Create vaccination error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { vaccinationId } = await request.json();

  const pet = await prisma.pet.findUnique({ where: { id } });
  if (!pet) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.user.role !== 'ADMIN' && pet.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.vaccination.delete({ where: { id: vaccinationId, petId: id } });
  return NextResponse.json({ message: 'Deleted' });
}
