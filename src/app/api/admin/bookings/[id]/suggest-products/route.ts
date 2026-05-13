import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { createNotification } from '@/lib/notifications';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { notDeleted } from '@/lib/prisma-soft';

interface Params { params: Promise<{ id: string }> }

/**
 * POST /api/admin/bookings/[id]/suggest-products
 * L'admin envoie au client une notification "produits suggérés pour
 * ton animal". Body : { petId: string, productIds: string[] }
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id: bookingId } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { petId?: string; productIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  if (!body.petId || !Array.isArray(body.productIds) || body.productIds.length === 0) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id: bookingId }),
    select: {
      id: true,
      clientId: true,
      bookingPets: { where: { petId: body.petId }, select: { pet: { select: { id: true, name: true } } } },
      client: { select: { isWalkIn: true } },
    },
  });
  if (!booking) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (booking.bookingPets.length === 0) {
    return NextResponse.json({ error: 'PET_NOT_IN_BOOKING' }, { status: 400 });
  }
  if (booking.client.isWalkIn) return NextResponse.json({ skipped: 'WALKIN' });

  const products = await prisma.product.findMany({
    where: { id: { in: body.productIds }, available: true },
    select: { id: true, name: true, price: true },
  });
  if (products.length === 0) return NextResponse.json({ error: 'NO_VALID_PRODUCTS' }, { status: 400 });

  const petName = booking.bookingPets[0].pet.name;
  const productList = products.map((p) => p.name).join(', ');
  const titleFr = 'Sélection pour votre animal';
  const titleEn = 'Hand-picked for your pet';
  const messageFr = `Nous avons sélectionné ${products.length} produit${products.length > 1 ? 's' : ''} pour ${petName} : ${productList}. Disponibles depuis votre fiche séjour.`;
  const messageEn = `We've selected ${products.length} product${products.length > 1 ? 's' : ''} for ${petName}: ${productList}. Available from your booking page.`;

  await createNotification({
    userId: booking.clientId,
    type: 'ADMIN_MESSAGE',
    titleFr, titleEn, messageFr, messageEn,
    metadata: { bookingId, petId: body.petId, productIds: products.map((p) => p.id).join(',') },
  });

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.NOTIFICATION_SENT,
    entityType: 'Booking',
    entityId: bookingId,
    details: { kind: 'PRODUCT_SUGGESTION', petId: body.petId, productCount: products.length },
  });

  return NextResponse.json({ success: true, sent: products.length });
}
