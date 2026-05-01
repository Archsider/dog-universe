import { headers } from 'next/headers';

/**
 * Returns the x-request-id from the incoming request headers, or undefined when
 * called outside of a request context (e.g. crons, background workers).
 * Uses a try/catch to avoid throwing in non-request environments.
 */
async function getRequestId(): Promise<string | undefined> {
  try {
    return (await headers()).get('x-request-id') ?? undefined;
  } catch {
    // Not in a request context (cron, worker, etc.) — omit the field entirely.
    return undefined;
  }
}

type Level = 'info' | 'warn' | 'error';

export async function log(
  level: Level,
  service: string,
  message: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  const requestId = await getRequestId();
  const entry: Record<string, unknown> = {
    level,
    service,
    message,
    timestamp: new Date().toISOString(),
    ...extra,
  };
  // Only include requestId when we're inside a request context.
  if (requestId !== undefined) entry.requestId = requestId;
  console[level === 'info' ? 'log' : level](JSON.stringify(entry));
}
