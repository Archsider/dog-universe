import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';
import { withSchema } from '@/lib/with-schema';
import { notDeleted } from '@/lib/prisma-soft';

const reviewSchema = z.object({
  bookingId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

/**
 * POST /api/reviews
 * Client soumet un avis pour une réservation COMPLETED.
 *
 * Validation déléguée à `withSchema` — le wrapper renvoie 400 INVALID_JSON
 * sur body non-JSON et 400 VALIDATION_ERROR sur Zod fail (avec `details`
 * uniquement hors prod). Le handler ne traite que les invariants métier
 * (auth, ownership, état du booking, unicité).
 */
export const POST = withSchema({ body: reviewSchema }, async (_request, { body }) => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { bookingId, rating, comment } = body;

  // Le booking doit appartenir au client courant et ne pas être soft-deleted.
  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id: bookingId, clientId: session.user.id }),
  });
  if (!booking) return NextResponse.json({ error: 'BOOKING_NOT_FOUND' }, { status: 404 });
  if (booking.status !== 'COMPLETED') {
    return NextResponse.json({ error: 'BOOKING_NOT_COMPLETED' }, { status: 400 });
  }

  // Unicité garantie par @unique(bookingId) — on intercepte ici pour renvoyer
  // un 409 propre plutôt que laisser remonter un P2002 brut.
  const existing = await prisma.review.findUnique({ where: { bookingId } });
  if (existing) return NextResponse.json({ error: 'REVIEW_ALREADY_EXISTS' }, { status: 409 });

  const review = await prisma.review.create({
    data: {
      bookingId,
      clientId: session.user.id,
      rating,
      comment: comment ?? null,
    },
  });

  return NextResponse.json({ review }, { status: 201 });
});
