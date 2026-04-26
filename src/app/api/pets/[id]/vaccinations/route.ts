import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { vaccinationCreateSchema, vaccinationConfirmSchema, formatZodError } from '@/lib/validation';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const pet = await prisma.pet.findUnique({ where: { id } });

  if (!pet) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if ((session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') && pet.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const parsed = vaccinationCreateSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(formatZodError(parsed.error), { status: 400 });
    }
    const { vaccineType, date, comment } = parsed.data;

    const vaccination = await prisma.vaccination.create({
      data: {
        petId: id,
        vaccineType,
        date: new Date(date),
        comment: comment ?? null,
        status: 'CONFIRMED',
      },
    });

    return NextResponse.json(vaccination, { status: 201 });
  } catch (error) {
    console.error('Create vaccination error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

// Confirm (or update) a DRAFT vaccination → status becomes CONFIRMED
export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const pet = await prisma.pet.findUnique({ where: { id } });

  if (!pet) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if ((session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') && pet.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const parsed = vaccinationConfirmSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(formatZodError(parsed.error), { status: 400 });
    }
    const { vaccinationId, vaccineType, date, nextDueDate, comment } = parsed.data;

    const vaccination = await prisma.vaccination.update({
      where: { id: vaccinationId, petId: id },
      data: {
        vaccineType,
        date: new Date(date),
        nextDueDate: nextDueDate ? new Date(nextDueDate) : null,
        comment: comment ?? null,
        status: 'CONFIRMED',
      },
    });

    return NextResponse.json(vaccination);
  } catch (error) {
    console.error('Confirm vaccination error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const url = new URL(request.url);
  const vaccinationId = url.searchParams.get('vaccinationId');
  if (!vaccinationId) return NextResponse.json({ error: 'Missing vaccinationId' }, { status: 400 });

  const pet = await prisma.pet.findUnique({ where: { id } });
  if (!pet) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if ((session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') && pet.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await prisma.vaccination.delete({ where: { id: vaccinationId, petId: id } });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    throw err;
  }
  return NextResponse.json({ message: 'Deleted' });
}
