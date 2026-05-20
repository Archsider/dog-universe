// RGPD-related integrity invariants.
//
// All queries read-only, indexed, and capped at 5 sample rows.
//
// Source : multi-agent audit Wave 4, 2026-05-20.

import { prisma } from '../prisma';
import type { InvariantResult } from './types';

/**
 * No outgoing notifications must land for users marked anonymizedAt — once
 * we strip a user's PII (right-to-be-forgotten), every contact channel
 * (email placeholder + null phone) should silently no-op.  Wave 1
 * implemented the filter in `createNotification` and the 5 outbound crons ;
 * this invariant guards against future regressions on top of those.
 */
export async function checkAnonymizedUserActiveNotifications(): Promise<InvariantResult> {
  const rows = await prisma.$queryRaw<Array<{
    id: string; userId: string; type: string; createdAt: Date;
  }>>`
    SELECT n.id, n."userId", n.type, n."createdAt"
    FROM "Notification" n
    JOIN "User" u ON u.id = n."userId"
    WHERE u."anonymizedAt" IS NOT NULL
      AND n."createdAt" > u."anonymizedAt"
    ORDER BY n."createdAt" DESC
    LIMIT 5
  `;
  const countRow = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c
    FROM "Notification" n
    JOIN "User" u ON u.id = n."userId"
    WHERE u."anonymizedAt" IS NOT NULL
      AND n."createdAt" > u."anonymizedAt"
  `;
  return {
    key: 'anonymized_user_active_notifications',
    label: 'Notifications créées après anonymisation (violation RGPD)',
    count: Number(countRow[0]?.c ?? BigInt(0)),
    sample: rows,
    severity: 'critical',
  };
}
