// GET /api/admin/search?q=...
//
// Universal admin search — feeds the Cmd+K command palette.  Returns the
// top 5 of each entity matching the query : clients, bookings, invoices,
// pets.  No ranking magic, just startsWith / contains on indexed columns.
//
// Source : Wave 6 (Admin classe mondiale, Feature #2).

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';

export const dynamic = 'force-dynamic';

interface SearchResult {
  type: 'client' | 'booking' | 'invoice' | 'pet';
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

export async function GET(req: NextRequest) {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  // Cap each domain at 5 results to keep the palette compact and the SQL fast.
  const LIMIT = 5;

  const [clients, bookings, invoices, pets] = await Promise.all([
    prisma.user.findMany({
      where: notDeleted<Prisma.UserWhereInput>({
        role: 'CLIENT',
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
        ],
      }),
      select: { id: true, name: true, email: true, phone: true },
      take: LIMIT,
    }),
    prisma.booking.findMany({
      where: notDeleted<Prisma.BookingWhereInput>({
        OR: [
          { id: { startsWith: q.toLowerCase() } },
          { client: { name: { contains: q, mode: 'insensitive' } } },
          { bookingPets: { some: { pet: { name: { contains: q, mode: 'insensitive' } } } } },
        ],
      }),
      select: {
        id: true,
        status: true,
        serviceType: true,
        startDate: true,
        client: { select: { name: true } },
        bookingPets: { select: { pet: { select: { name: true } } }, take: 2 },
      },
      orderBy: { startDate: 'desc' },
      take: LIMIT,
    }),
    prisma.invoice.findMany({
      where: {
        OR: [
          { invoiceNumber: { contains: q, mode: 'insensitive' } },
          { client: { name: { contains: q, mode: 'insensitive' } } },
        ],
      },
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        status: true,
        client: { select: { name: true } },
      },
      orderBy: { issuedAt: 'desc' },
      take: LIMIT,
    }),
    prisma.pet.findMany({
      where: notDeleted<Prisma.PetWhereInput>({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { microchipNumber: { contains: q } },
          { owner: { name: { contains: q, mode: 'insensitive' } } },
        ],
      }),
      select: {
        id: true,
        name: true,
        species: true,
        breed: true,
        owner: { select: { id: true, name: true } },
      },
      take: LIMIT,
    }),
  ]);

  const results: SearchResult[] = [];

  for (const c of clients) {
    results.push({
      type: 'client',
      id: c.id,
      title: c.name,
      subtitle: c.email + (c.phone ? ` · ${c.phone}` : ''),
      href: `/admin/clients/${c.id}`,
    });
  }
  for (const b of bookings) {
    const petNames = b.bookingPets.map((bp) => bp.pet?.name).filter(Boolean).join(', ');
    const dateStr = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(b.startDate);
    results.push({
      type: 'booking',
      id: b.id,
      title: `${b.client?.name ?? '—'} · ${petNames || '—'}`,
      subtitle: `${b.serviceType} · ${b.status} · ${dateStr}`,
      href: `/admin/reservations/${b.id}`,
    });
  }
  for (const i of invoices) {
    results.push({
      type: 'invoice',
      id: i.id,
      title: i.invoiceNumber,
      subtitle: `${i.client?.name ?? '—'} · ${i.status} · ${Number(i.amount)} MAD`,
      href: `/admin/billing?invoice=${i.id}`,
    });
  }
  for (const p of pets) {
    results.push({
      type: 'pet',
      id: p.id,
      title: p.name,
      subtitle: `${p.species}${p.breed ? ` · ${p.breed}` : ''} · ${p.owner?.name ?? '—'}`,
      href: `/admin/animals/${p.id}`,
    });
  }

  return NextResponse.json({ results });
}
