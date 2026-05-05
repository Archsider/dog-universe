import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';
import { profileUpdateSchema, formatZodError } from '@/lib/validation';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findFirst({
    where: { id: session.user.id, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
    select: { id: true, name: true, firstName: true, lastName: true, email: true, phone: true },
  });

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(user);
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = profileUpdateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const { firstName, lastName, phone } = parsed.data;

  // Construit updateData uniquement avec les champs fournis (PATCH semantics).
  // Si firstName ou lastName change, on resync name = firstName + ' ' + lastName.
  const updateData: { firstName?: string; lastName?: string; name?: string; phone?: string | null } = {};
  if (firstName !== undefined) updateData.firstName = firstName;
  if (lastName !== undefined) updateData.lastName = lastName;
  if (phone !== undefined) updateData.phone = phone ?? null;

  if (firstName !== undefined || lastName !== undefined) {
    const current = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { firstName: true, lastName: true },
    });
    const fn = firstName ?? current?.firstName ?? '';
    const ln = lastName ?? current?.lastName ?? '';
    updateData.name = `${fn} ${ln}`.trim();
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
    select: { id: true, name: true, firstName: true, lastName: true, email: true, phone: true },
  });

  return NextResponse.json(user);
}
