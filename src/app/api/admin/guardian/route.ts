// GET /api/admin/guardian — SUPERADMIN only.
// Returns the 30 most recent GuardianEvents for the client-side auto-refresh.
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const authResult = await requireRole(['SUPERADMIN']);
  if (authResult.error) return authResult.error;

  const events = await prisma.guardianEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      sentryEventId: e.sentryEventId,
      sentryIssueId: e.sentryIssueId,
      title: e.title,
      culprit: e.culprit,
      level: e.level,
      classification: e.classification,
      severity: e.severity,
      action: e.action,
      reason: e.reason,
      githubIssueUrl: e.githubIssueUrl,
      occurrencesSeen: e.occurrencesSeen,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}
