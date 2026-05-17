// /api/cron/health-reconciliation
// Daily 06h UTC. Runs the same invariant checks as /admin/health.
// If any invariant has count > 0, emails all ADMIN/SUPERADMIN with a digest.
// Lock Redis prevents duplicate execution within 23h.

import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { withSpan, logServerError } from '@/lib/observability';
import { runAllInvariantChecks } from '@/lib/health-invariants';
import { sendEmailNow } from '@/lib/notify-now';
import { defineCron } from '@/lib/cron-runner';

export const maxDuration = 60;

export const GET = defineCron({
  name: 'health-reconciliation',
  period: 'daily',
  fn: async () => {
    return await withSpan('cron.health-reconciliation', {}, async () => {
      const invariants = await runAllInvariantChecks();
      const anomalies = invariants.filter((i) => i.count > 0);

      if (anomalies.length === 0) {
        return { anomalies: 0 };
      }

      // Alert: email all ADMIN/SUPERADMIN
      const admins = await prisma.user.findMany({
        where: { ...notDeleted(), role: { in: ['ADMIN', 'SUPERADMIN'] } },
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

      return {
        anomalies: anomalies.length,
        emailedAdmins: sent,
        details: anomalies.map((a) => ({ key: a.key, count: a.count, severity: a.severity })),
      };
    });
  },
});
