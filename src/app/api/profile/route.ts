import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, phone: true },
  });

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(user);
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  const updateData: { name?: string; phone?: string | null } = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 255);
    if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    updateData.name = name;
  }
  if (body.phone !== undefined) {
    updateData.phone = body.phone ? String(body.phone).trim().slice(0, 20) : null;
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
    select: { id: true, name: true, email: true, phone: true },
  });

  return NextResponse.json(user);
}
