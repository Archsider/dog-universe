import { auth } from '../../auth';

/**
 * Resolve the current authenticated user's ID for the purpose of bucketing
 * rate-limit checks per user. Returns `null` when there is no session.
 *
 * The original middleware only invokes `auth()` on rate-limited routes; this
 * helper preserves that contract — callers must invoke it lazily.
 *
 * Errors are propagated to the caller so it can apply its own fail-safe
 * (the rate-limit module catches and falls back to IP).
 */
export async function resolveUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
