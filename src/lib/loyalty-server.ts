// Loyalty cache invalidation hooks (server-only).
//
// On this branch the Redis loyalty cache from feature/* is NOT in place
// yet — `getLoyaltyGrade` reads straight from Prisma, so there is nothing
// to invalidate. We expose `invalidateLoyaltyCache` as a no-op so that
// callers wired during the security pass (admin/clients/[id], admin/
// bookings/[id], lib/payments) compile cleanly. The day this branch
// adopts the Redis layer, replace the body with the real `redis.del()`.
export async function invalidateLoyaltyCache(_userId: string): Promise<void> {
  return;
}
