// POST /api/admin/maintenance/action — SUPERADMIN only.
//
// One endpoint per maintenance action would mean 12+ route files ; instead
// we route by `action` field in the body.  Destructive actions require
// `confirm: true` ; safe ones (VACUUM, refresh MV, clear cache) don't.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-guards';
import {
  clearBackupErrorStamp,
  refreshMonthlyRevenueMV,
  vacuumAnalyzeHotTables,
  clearBusinessCaches,
  purgeSmsLog,
  purgeGuardianEvents,
  purgeActionLog,
  purgePasswordResetTokens,
  purgeTaxiStatusHistory,
  purgeProductCatalogSuggestionsResolved,
  purgeHeartbeatForce,
} from '@/lib/maintenance/actions';
import { logAction } from '@/lib/log';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ACTION_KEYS = [
  'clear_backup_error',
  'refresh_revenue_mv',
  'vacuum_hot_tables',
  'clear_business_caches',
  'purge_sms_log',
  'purge_guardian_events',
  'purge_action_log',
  'purge_password_reset_tokens',
  'purge_taxi_status_history',
  'purge_product_suggestions_resolved',
  'purge_heartbeat_force',
] as const;

const bodySchema = z.object({
  action: z.enum(ACTION_KEYS),
  confirm: z.boolean().optional(),
}).strict();

export async function POST(req: NextRequest) {
  const guard = await requireRole(['SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_BODY' }, { status: 400 });
  }
  const { action, confirm } = parsed;
  const actorId = session.user.id;

  let result;
  switch (action) {
    case 'clear_backup_error':                 result = await clearBackupErrorStamp(); break;
    case 'refresh_revenue_mv':                 result = await refreshMonthlyRevenueMV(); break;
    case 'vacuum_hot_tables':                  result = await vacuumAnalyzeHotTables(); break;
    case 'clear_business_caches':              result = await clearBusinessCaches(); break;
    case 'purge_sms_log':                      result = await purgeSmsLog({ confirm, actorId }); break;
    case 'purge_guardian_events':              result = await purgeGuardianEvents({ confirm, actorId }); break;
    case 'purge_action_log':                   result = await purgeActionLog({ confirm, actorId }); break;
    case 'purge_password_reset_tokens':        result = await purgePasswordResetTokens({ confirm, actorId }); break;
    case 'purge_taxi_status_history':          result = await purgeTaxiStatusHistory({ confirm, actorId }); break;
    case 'purge_product_suggestions_resolved': result = await purgeProductCatalogSuggestionsResolved({ confirm, actorId }); break;
    case 'purge_heartbeat_force':              result = await purgeHeartbeatForce({ confirm, actorId }); break;
  }

  // Audit log for every action (success or failure).
  await logAction({
    userId: actorId,
    action: 'MAINTENANCE_ACTION',
    entityType: 'System',
    entityId: action,
    details: { ok: result.ok, ...(result.ok ? { rowsAffected: result.rowsAffected, detail: result.detail } : { error: result.error }) },
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
