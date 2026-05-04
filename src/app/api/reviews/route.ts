import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';

const reviewSchema = z.object({
  bookingId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

/**
 * POST /api/reviews
 * Client soumet un avis pour une réservation COMPLETED.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'CLIENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() }, { status: 400 });
  }

  const { bookingId, rating, comment } = parsed.data;

  // Vérifie que la réservation appartient au client et est COMPLETED
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, clientId: session.user.id, deletedAt: null }, // soft-delete: required
  });
  if (!booking) return NextResponse.json({ error: 'BOOKING_NOT_FOUND' }, { status: 404 });
  if (booking.status !== 'COMPLETED') return NextResponse.json({ error: 'BOOKING_NOT_COMPLETED' }, { status: 400 });

  // Vérifie qu'il n'existe pas déjà un avis (unicité garantie par @unique)
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
}
