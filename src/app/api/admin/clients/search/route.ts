import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/clients/search?q=...
 *
 * Lightweight autocomplete endpoint for admin client pickers.
 * Returns up to 50 matches when `q` is >= 2 chars, otherwise the 20 most
 * recently created clients. Used by `ClientSearchSelect` to avoid loading
 * the full `take: 1000` clients dropdown on /admin/billing.
 *
 * Auth: ADMIN | SUPERADMIN.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();

  // soft-delete: required — no global extension (Edge Runtime incompatible)
  const baseWhere = { role: 'CLIENT' as const, deletedAt: null };

  // Le select inclut firstName/lastName/role pour permettre l'affichage
  // « Prénom Nom » côté composant (avec fallback `name` legacy → email).
  // Si la migration `20260505_user_firstname_lastname` n'a pas été appliquée
  // sur la prod (colonnes absentes), Prisma 500. Dans ce cas → fallback safe
  // sur le select minimal.
  const fullSelect = {
    id: true,
    name: true,
    firstName: true,
    lastName: true,
    email: true,
    phone: true,
    role: true,
  };
  const safeSelect = { id: true, name: true, email: true, phone: true };

  async function findWithFallback<T>(args: { where: object; orderBy: object; take: number }): Promise<T[]> {
    try {
      const rows = await prisma.user.findMany({ ...args, select: fullSelect });
      return rows as unknown as T[];
    } catch (err) {
      logger.error('clients-search', 'firstName/lastName select failed — falling back to safe select', { err: err instanceof Error ? err.message : String(err) });
      const rows = await prisma.user.findMany({ ...args, select: safeSelect });
      return rows as unknown as T[];
    }
  }

  if (q.length < 2) {
    const clients = await findWithFallback({
      where: baseWhere,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    logger.error('admin-clients-search', 'GET (no query)', { count: clients.length });
    return NextResponse.json({ clients });
  }

  const clients = await findWithFallback({
    where: {
      ...baseWhere,
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: { name: 'asc' },
    take: 50,
  });

  logger.error('admin-clients-search', 'GET (query)', { q: q.slice(0, 50), count: clients.length });

  return NextResponse.json({ clients });
}
