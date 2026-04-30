/**
 * Cursor-based pagination helpers.
 *
 * Cursor format (opaque from client perspective): base64url-encoded
 * `${createdAt.toISOString()}:${id}`. Always paired with a stable order
 * `[{ createdAt: 'desc' }, { id: 'desc' }]` so the (createdAt, id) tuple
 * is a strict total order — required for stable pagination across pages.
 */

export interface DecodedCursor {
  createdAt: Date;
  id: string;
}

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function encodeCursor(createdAt: Date, id: string): string {
  return toBase64Url(`${createdAt.toISOString()}:${id}`);
}

/**
 * Decode an opaque cursor. Returns null on invalid format — caller should
 * respond with HTTP 400 in that case.
 */
export function decodeCursor(cursor: string): DecodedCursor | null {
  try {
    const raw = fromBase64Url(cursor);
    const sepIdx = raw.indexOf(':');
    if (sepIdx <= 0 || sepIdx >= raw.length - 1) return null;
    const iso = raw.slice(0, sepIdx);
    const id = raw.slice(sepIdx + 1);
    const createdAt = new Date(iso);
    if (isNaN(createdAt.getTime())) return null;
    if (!id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export function parseLimit(raw: string | null, fallback = DEFAULT_PAGE_SIZE): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}
