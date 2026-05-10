import type { Prisma } from '@prisma/client';

/** Filtre "client CLIENT non soft-deleted" — à utiliser partout où on
 * liste/agrège des Users côté admin pour éviter le leak cross-role + RGPD. */
export const safeClientWhere: Prisma.UserWhereInput = {
  role: 'CLIENT',
  deletedAt: null,
};

/** Filtre booking non soft-deleted. */
export const safeBookingWhere: Prisma.BookingWhereInput = {
  deletedAt: null,
};

/** Filtre pet non soft-deleted. */
export const safePetWhere: Prisma.PetWhereInput = {
  deletedAt: null,
};
