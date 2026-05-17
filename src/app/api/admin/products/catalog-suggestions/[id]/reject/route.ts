import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth-guards';

/**
 * POST /api/admin/products/catalog-suggestions/[id]/reject
 *
 * Marks a pending suggestion as rejected. No side effects on the
 * underlying InvoiceItem — it stays category='OTHER' / productId=null.
 * Idempotent: rejecting an already-resolved suggestion returns 409.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;
  const { id } = await params;

  const suggestion = await prisma.productCatalogSuggestion.findUnique({ where: { id }, select: { status: true } });
  if (!suggestion) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (suggestion.status !== 'pending') {
    return NextResponse.json({ error: 'ALREADY_RESOLVED', status: suggestion.status }, { status: 409 });
  }

  await prisma.productCatalogSuggestion.update({
    where: { id },
    data: { status: 'rejected', respondedAt: new Date(), respondedBy: session.user.id },
  });

  return NextResponse.json({ ok: true, suggestionId: id });
}
