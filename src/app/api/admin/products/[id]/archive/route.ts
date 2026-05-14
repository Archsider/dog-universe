import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { serializeProduct } from '../../_lib/serialize';

interface Params { params: Promise<{ id: string }> }

function isAdmin(role?: string) {
  return role === 'ADMIN' || role === 'SUPERADMIN';
}

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (product.isArchived) return NextResponse.json(serializeProduct(product));

  const updated = await prisma.product.update({
    where: { id },
    data: { isArchived: true, version: { increment: 1 } },
  });

  await prisma.actionLog.create({
    data: {
      userId: session.user.id,
      action: 'PRODUCT_ARCHIVED',
      entityType: 'PRODUCT',
      entityId: id,
      details: JSON.stringify({ name: product.name }),
    },
  });

  return NextResponse.json(serializeProduct(updated));
}
