// /api/cron/health-reconciliation
// Daily 06h UTC. Runs the same invariant checks as /admin/health.
// If any invariant has count > 0, emails all ADMIN/SUPERADMIN with a digest.
// Lock Redis prevents duplicate execution within 23h.

import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { acquireCronLock } from '@/lib/cron-lock';
import { markCronRun, withSpan, logServerError } from '@/lib/observability';
import { runAllInvariantChecks } from '@/lib/health-invariants';
import { sendEmailNow } from '@/lib/notify-now';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  const provided = req.headers.get('x-cron-secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '')
    ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(cronSecret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const acquired = await acquireCronLock('health-reconciliation', 23 * 3600, 'daily');
  if (!acquired) {
    return NextResponse.json({ skipped: true, reason: 'already_run' }, { status: 200 });
  }

  await markCronRun('health-reconciliation');

  try {
    return await withSpan('cron.health-reconciliation', {}, async () => {
      const invariants = await runAllInvariantChecks();
      const anomalies = invariants.filter((i) => i.count > 0);

      if (anomalies.length === 0) {
        return NextResponse.json({ ok: true, anomalies: 0 });
      }

      // Alert: email all ADMIN/SUPERADMIN
      const admins = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'SUPERADMIN'] }, deletedAt: null },
        select: { email: true, name: true },
        take: 100,
      });

      const lines = anomalies.map(
        (a) => `• ${a.label} : ${a.count} ligne(s) [${a.severity}]`,
      );
      const subject = `[Dog Universe] ${anomalies.length} invariant(s) DB violé(s)`;
      const html = `
        <h2>Reconciliation health — ${new Date().toLocaleDateString('fr-FR')}</h2>
        <p>Les vérifications quotidiennes ont détecté des anomalies :</p>
        <ul>${anomalies.map((a) => `<li><strong>${a.label}</strong> — ${a.count} ligne(s) (${a.severity})</li>`).join('')}</ul>
        <p>Consultez <code>/admin/health</code> pour les échantillons et la résolution.</p>
        <pre style="background:#f4f4f4;padding:8px;border-radius:4px;font-size:11px;">${lines.join('\n')}</pre>
      `;

      let sent = 0;
      for (const a of admins) {
        try {
          sendEmailNow({ to: a.email, subject, html });
          sent++;
        } catch (err) {
          logServerError('cron-health-reconciliation', 'email enqueue failed', err, { recipient: a.email });
        }
      }

      return NextResponse.json({
        ok: true,
        anomalies: anomalies.length,
        emailedAdmins: sent,
        details: anomalies.map((a) => ({ key: a.key, count: a.count, severity: a.severity })),
      });
    });
  } catch (err) {
    logServerError('cron-health-reconciliation', 'cron failed', err);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
