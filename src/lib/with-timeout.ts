/**
 * withTimeout — wraps any Promise in a race against a timeout.
 *
 * Usage:
 *   const user = await withTimeout(prisma.user.findFirst(...), 5_000, 'user lookup');
 *
 * On timeout, throws TimeoutError (not a generic Error) so callers can
 * distinguish infrastructure timeouts from business logic failures.
 *
 * The underlying Promise continues running after the timeout — this is
 * intentional for DB queries (we can't cancel them mid-flight) and matches
 * how AbortSignal.timeout() works in fetch contexts.
 */

export class TimeoutError extends Error {
  readonly operation: string;
  readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation = 'operation',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(operation, timeoutMs));
    }, timeoutMs);

    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * withFallback — runs the primary fn, returns fallback on any error or timeout.
 * Ideal for non-critical reads where degraded output > hard failure.
 *
 * Example:
 *   const count = await withFallback(() => prisma.notification.count(...), 0, 3_000);
 */
export async function withFallback<T>(
  fn: () => Promise<T>,
  fallback: T,
  timeoutMs = 5_000,
  operation = 'operation',
): Promise<T> {
  try {
    return await withTimeout(fn(), timeoutMs, operation);
  } catch {
    return fallback;
  }
}
