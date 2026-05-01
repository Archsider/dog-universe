import { headers } from 'next/headers';

export async function getRequestId(): Promise<string> {
  try {
    return (await headers()).get('x-request-id') ?? 'no-rid';
  } catch {
    return 'no-rid';
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
  console[level === 'info' ? 'log' : level](
    JSON.stringify({
      level,
      service,
      message,
      requestId,
      timestamp: new Date().toISOString(),
      ...extra,
    }),
  );
}
