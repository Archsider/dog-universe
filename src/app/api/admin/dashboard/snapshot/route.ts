// GET /api/admin/dashboard/snapshot
//
// Lightweight polling endpoint used by the AdminGreeting / Live Cockpit
// to refresh the operational stats every 30 s.  Returns the subset of the
// full DashboardSnapshot that the live header cares about — no heavy
// table joins, no big lists.
//
// Source : Wave 6 (Admin classe mondiale, Feature #1).

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { loadDashboardSnapshot } from '@/app/[locale]/admin/dashboard/_lib/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;

  const snapshot = await loadDashboardSnapshot();
  return NextResponse.json({
    arrivalsToday: snapshot.today.checkIns.length,
    departuresToday: snapshot.today.checkOuts.length,
    taxiToday: snapshot.today.taxiRuns.length,
    dogsIn: snapshot.pension.dogsIn,
    catsIn: snapshot.pension.catsIn,
    dogsLimit: snapshot.pension.dogsLimit,
    catsLimit: snapshot.pension.catsLimit,
    pending: snapshot.pending.count,
    timestamp: new Date().toISOString(),
  });
}
