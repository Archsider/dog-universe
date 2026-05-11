/**
 * Structured logger.
 *
 * Two flavors:
 *  - Async `log(level, service, message, extra)` — picks up `x-request-id`
 *    when called inside a Server Component / Route Handler request context.
 *    Lazily imports `next/headers` to stay safe in Edge / client / non-request
 *    environments.
 *  - Sync helpers (`logger.error`, `logger.warn`, `logger.info`) — fire-and-forget,
 *    no request-id resolution. Safe in any runtime (Node, Edge, browser).
 *
 * Both emit the same JSON shape on stdout:
 *   { level, service, message, timestamp, ...extra, [requestId] }
 *
 * Vercel autodetects this format and indexes the fields.
 */

async function getRequestId(): Promise<string | undefined> {
  try {
    // Dynamic import keeps `next/headers` out of Edge / client bundles.
    const { headers } = await import('next/headers');
    return (await headers()).get('x-request-id') ?? undefined;
  } catch {
    return undefined;
  }
}

type Level = 'info' | 'warn' | 'error';

function serializeError(err: unknown): unknown {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}

function emit(
  level: Level,
  service: string,
  message: string,
  extra?: Record<string, unknown>,
  requestId?: string,
): void {
  const entry: Record<string, unknown> = {
    level,
    service,
    message,
    timestamp: new Date().toISOString(),
  };
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      entry[k] = v instanceof Error ? serializeError(v) : v;
    }
  }
  if (requestId !== undefined) entry.requestId = requestId;
  // eslint-disable-next-line no-console
  console[level === 'info' ? 'log' : level](JSON.stringify(entry));
}

export async function log(
  level: Level,
  service: string,
  message: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  const requestId = await getRequestId();
  emit(level, service, message, extra, requestId);
}

/**
 * Sync structured logger. Safe in any runtime — no `next/headers` dependency.
 * Use for non-async sites, hot paths, event handlers, Edge middleware,
 * and Client Components.
 */
export const logger = {
  error(service: string, message: string, extra?: Record<string, unknown>): void {
    emit('error', service, message, extra);
  },
  warn(service: string, message: string, extra?: Record<string, unknown>): void {
    emit('warn', service, message, extra);
  },
  info(service: string, message: string, extra?: Record<string, unknown>): void {
    emit('info', service, message, extra);
  },
};
