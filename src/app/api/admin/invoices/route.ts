import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { decodeCursor, encodeCursor, parseLimit } from '@/lib/pagination';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);

  const VALID_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'];
  const VALID_PAYMENT_METHODS = ['CASH', 'CARD', 'CHECK', 'TRANSFER'];
  const VALID_CATEGORIES = ['BOARDING', 'PET_TAXI', 'GROOMING', 'PRODUCT', 'OTHER'];

  const status = searchParams.get('status') || '';
  const search = (searchParams.get('search') || '').trim();
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';
  const paymentMethod = searchParams.get('paymentMethod') || '';
  const category = searchParams.get('category') || '';
  const amountMin = (searchParams.get('amountMin') || '').trim();
  const amountMax = (searchParams.get('amountMax') || '').trim();
  const clientId = (searchParams.get('clientId') || '').trim();
  const year = searchParams.get('year') || '';

  const limit = parseLimit(searchParams.get('limit'));
  const cursorRaw = searchParams.get('cursor');
  const decoded = cursorRaw ? decodeCursor(cursorRaw) : null;
  if (cursorRaw && !decoded) {
    return NextResponse.json({ error: 'INVALID_CURSOR' }, { status: 400 });
  }

  const dateFromParsed = dateFrom ? new Date(dateFrom) : null;
  const dateToParsed = dateTo ? new Date(dateTo + 'T23:59:59.999Z') : null;
  const dateFromValid = dateFromParsed && !isNaN(dateFromParsed.getTime()) ? dateFromParsed : null;
  const dateToValid = dateToParsed && !isNaN(dateToParsed.getTime()) ? dateToParsed : null;

  const amountMinParsed = amountMin !== '' ? parseFloat(amountMin) : NaN;
  const amountMaxParsed = amountMax !== '' ? parseFloat(amountMax) : NaN;
  const amountMinValid = !isNaN(amountMinParsed) && amountMinParsed >= 0 ? amountMinParsed : null;
  const amountMaxValid = !isNaN(amountMaxParsed) && amountMaxParsed >= 0 ? amountMaxParsed : null;

  const issuedAtFilter: Record<string, Date> = {};
  if (dateFromValid) issuedAtFilter.gte = dateFromValid;
  if (dateToValid) issuedAtFilter.lte = dateToValid;
  if (!Object.keys(issuedAtFilter).length && year) {
    const y = parseInt(year);
    if (!isNaN(y)) {
      issuedAtFilter.gte = new Date(`${y}-01-01`);
      issuedAtFilter.lte = new Date(`${y}-12-31T23:59:59.999Z`);
    }
  }

  const amountFilter: Record<string, number> = {};
  if (amountMinValid !== null) amountFilter.gte = amountMinValid;
  if (amountMaxValid !== null) amountFilter.lte = amountMaxValid;

  const where: Record<string, unknown> = {
    ...(status && VALID_STATUSES.includes(status) ? { status } : {}),
    ...(clientId ? { clientId } : {}),
    ...(search
      ? {
          OR: [
            { invoiceNumber: { contains: search, mode: 'insensitive' } },
            { clientDisplayName: { contains: search, mode: 'insensitive' } },
            { client: { name: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
    ...(Object.keys(issuedAtFilter).length ? { issuedAt: issuedAtFilter } : {}),
    ...(paymentMethod && VALID_PAYMENT_METHODS.includes(paymentMethod) ? { payments: { some: { paymentMethod } } } : {}),
    ...(category && VALID_CATEGORIES.includes(category) ? { items: { some: { category } } } : {}),
    ...(Object.keys(amountFilter).length ? { amount: amountFilter } : {}),
  };

  if (decoded) {
    where.AND = [
      {
        OR: [
          { createdAt: { lt: decoded.createdAt } },
          { createdAt: decoded.createdAt, id: { lt: decoded.id } },
        ],
      },
    ];
  }

  const items = await prisma.invoice.findMany({
    where,
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      booking: { select: { id: true, serviceType: true } },
      payments: { orderBy: { paymentDate: 'desc' }, take: 1 },
      items: { select: { category: true, total: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const last = data[data.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return NextResponse.json({ data, nextCursor, hasMore });
}
