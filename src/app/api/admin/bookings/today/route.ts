// GET /api/admin/bookings/today — admin only.
// Returns the same snapshot used to render the Today view, so a client
// poller can refresh the data in the background without a full page reload.
// Cached 30s by Next.js fetch cache + `force-dynamic` is OFF (we want SWR).
import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { loadTodaySnapshot } from '@/app/[locale]/admin/reservations/_lib/today-queries';

export const revalidate = 30; // 30s cache, matches the polling interval

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const snapshot = await loadTodaySnapshot();
  return NextResponse.json(snapshot, {
    headers: { 'cache-control': 'private, max-age=0, must-revalidate' },
  });
}
