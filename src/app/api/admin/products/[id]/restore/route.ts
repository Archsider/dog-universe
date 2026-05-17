import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { serializeProduct } from '../../_lib/serialize';

interface Params { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const authResult = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (authResult.error) return authResult.error;
  const { session } = authResult;

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (!product.isArchived) return NextResponse.json(serializeProduct(product));

  const updated = await prisma.product.update({
    where: { id },
    data: { isArchived: false, version: { increment: 1 } },
  });

  await prisma.actionLog.create({
    data: {
      userId: session.user.id,
      action: 'PRODUCT_RESTORED',
      entityType: 'PRODUCT',
      entityId: id,
      details: JSON.stringify({ name: product.name }),
    },
  });

  return NextResponse.json(serializeProduct(updated));
}
