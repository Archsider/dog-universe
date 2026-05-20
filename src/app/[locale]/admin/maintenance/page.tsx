// /admin/maintenance — SUPERADMIN-only ops dashboard.
//
// Three sections :
//   - Diagnostics (read-only)
//   - Quick actions (safe one-clicks)
//   - Purges (destructive, confirm-required)
//
// Source : Wave 7 (admin maintenance), 2026-05-20.

import { redirect } from 'next/navigation';
import { getCachedAuth } from '@/lib/cached-auth';
import { loadMaintenanceDiagnostics } from '@/lib/maintenance/diagnostics';
import MaintenanceClient from './MaintenanceClient';

type Params = { locale: string };

export const dynamic = 'force-dynamic';

export default async function MaintenancePage({ params }: { params: Promise<Params> }) {
  const { locale } = await params;
  const session = await getCachedAuth();
  if (!session?.user || session.user.role !== 'SUPERADMIN') {
    redirect(`/${locale}/admin/dashboard`);
  }

  const diag = await loadMaintenanceDiagnostics();

  return <MaintenanceClient locale={locale} initialDiagnostics={diag} />;
}
