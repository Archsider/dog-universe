// GET /api/admin/taxi-trips/history — ADMIN / SUPERADMIN only.
//
// Cursor-paginated list of completed taxi trips for the Historique tab
// on /admin/driver. Filter params (all optional, URL-encoded):
//
//   from        YYYY-MM-DD (inclusive)
//   to          YYYY-MM-DD (inclusive)
//   clientId    cuid — exact client match
//   type        OUTBOUND | RETURN | STANDALONE
//   status      ARRIVED_AT_PENSION | ARRIVED_AT_CLIENT | COMPLETED | CANCELLED | REJECTED | NO_SHOW
//   cursor      id of the last row of the previous page (for pagination)
//   pageSize    1..100, default 20
//
// Response shape: { rows, nextCursor, totalCount }
// See `src/lib/services/taxi-history.service.ts` for the canonical contract.

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import {
  getTaxiTripHistory,
  HISTORY_TERMINAL_STATUSES,
  type HistoryStatus,
  type TripType,
} from '@/lib/services/taxi-history.service';

export const dynamic = 'force-dynamic';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CUID_RE = /^c[a-z0-9]{20,30}$/i;
const VALID_TYPES = new Set<TripType>(['OUTBOUND', 'RETURN', 'STANDALONE']);
const VALID_STATUSES = new Set<HistoryStatus>(HISTORY_TERMINAL_STATUSES);

function parseString(value: string | null, validator: (s: string) => boolean): string | undefined {
  if (!value) return undefined;
  return validator(value) ? value : undefined;
}

export async function GET(request: NextRequest) {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;

  const sp = request.nextUrl.searchParams;

  const from = parseString(sp.get('from'), (s) => ISO_DATE_RE.test(s));
  const to = parseString(sp.get('to'), (s) => ISO_DATE_RE.test(s));
  const clientId = parseString(sp.get('clientId'), (s) => CUID_RE.test(s));
  const typeRaw = sp.get('type');
  const type = typeRaw && VALID_TYPES.has(typeRaw as TripType) ? (typeRaw as TripType) : undefined;
  const statusRaw = sp.get('status');
  const status =
    statusRaw && VALID_STATUSES.has(statusRaw as HistoryStatus)
      ? (statusRaw as HistoryStatus)
      : undefined;

  const cursor = parseString(sp.get('cursor'), (s) => CUID_RE.test(s));
  const pageSizeRaw = sp.get('pageSize');
  const pageSize = pageSizeRaw ? Math.max(1, Math.min(100, parseInt(pageSizeRaw, 10) || 20)) : 20;

  try {
    const page = await getTaxiTripHistory({
      from,
      to,
      clientId,
      type,
      status,
      cursor,
      pageSize,
    });
    return NextResponse.json(page);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'history_query_failed', message },
      { status: 500 },
    );
  }
}
