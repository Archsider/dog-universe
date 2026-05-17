import type { Prisma } from '@prisma/client';
import { notDeleted } from '@/lib/prisma-soft';

/** Filtre "client CLIENT non soft-deleted" — à utiliser partout où on
 * liste/agrège des Users côté admin pour éviter le leak cross-role + RGPD. */
export const safeClientWhere: Prisma.UserWhereInput = notDeleted({ role: 'CLIENT' as const });

/** Filtre booking non soft-deleted. */
export const safeBookingWhere: Prisma.BookingWhereInput = notDeleted();

/** Filtre pet non soft-deleted. */
export const safePetWhere: Prisma.PetWhereInput = notDeleted();
