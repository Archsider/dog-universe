// GET /api/admin/taxi-trips/history/export — ADMIN / SUPERADMIN only.
//
// CSV export of the matching taxi-trip history. Same filter params as the
// JSON endpoint (`from`, `to`, `clientId`, `type`, `status`), capped at
// HISTORY_EXPORT_CAP (5_000) rows. Streams a `text/csv` body with UTF-8 BOM
// for Excel compatibility.
//
// File name: `taxi-history-YYYY-MM-DD.csv` (date Casablanca).

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { escapeCsv, UTF8_BOM } from '@/lib/csv';
import { casablancaDateOnly } from '@/lib/dates-casablanca';
import {
  getTaxiTripHistoryForExport,
  HISTORY_TERMINAL_STATUSES,
  type HistoryStatus,
  type TripType,
} from '@/lib/services/taxi-history.service';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CUID_RE = /^c[a-z0-9]{20,30}$/i;
const VALID_TYPES = new Set<TripType>(['OUTBOUND', 'RETURN', 'STANDALONE']);
const VALID_STATUSES = new Set<HistoryStatus>(HISTORY_TERMINAL_STATUSES);

const TYPE_LABELS: Record<TripType, string> = {
  OUTBOUND: 'Aller',
  RETURN: 'Retour',
  STANDALONE: 'Course directe',
};

const STATUS_LABELS: Record<string, string> = {
  ARRIVED_AT_PENSION: 'Arrivé à la pension',
  ARRIVED_AT_CLIENT: 'Arrivé chez le client',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
  REJECTED: 'Refusée',
  NO_SHOW: 'No-show',
};

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

  const rows = await getTaxiTripHistoryForExport({ from, to, clientId, type, status });

  // CSV header columns. The order is the order admins see in the UI; date /
  // heure come first so a chronological sort in Excel works out of the box.
  const header = [
    'Date',
    'Heure',
    'Type',
    'Statut',
    'Client',
    'Animaux',
    'Distance (km)',
    'Adresse depart',
    'Adresse destination',
    'Booking ID',
  ];

  const body = rows.map((r) => [
    escapeCsv(r.date),
    escapeCsv(r.time),
    escapeCsv(TYPE_LABELS[r.type] ?? r.type),
    escapeCsv(STATUS_LABELS[r.status] ?? r.status),
    escapeCsv(r.clientName),
    escapeCsv(r.petNames.join(', ')),
    escapeCsv(r.distanceKm.toFixed(1)),
    escapeCsv(r.pickupAddress),
    escapeCsv(r.dropoffAddress),
    escapeCsv(r.bookingId),
  ].join(';'));

  const csv = UTF8_BOM + [header.join(';'), ...body].join('\n');
  const filename = `taxi-history-${casablancaDateOnly(new Date())}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
