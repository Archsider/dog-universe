// GET /api/admin/maintenance/diagnostics — SUPERADMIN only.
//
// Returns the read-only DB diagnostics bundle for /admin/maintenance.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { loadMaintenanceDiagnostics } from '@/lib/maintenance/diagnostics';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  const guard = await requireRole(['SUPERADMIN']);
  if (guard.error) return guard.error;
  const diag = await loadMaintenanceDiagnostics();
  return NextResponse.json(diag);
}
