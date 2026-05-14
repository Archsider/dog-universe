// Monthly RGPD purge cron — delegates to runPurgeAnonymized() so the
// SUPERADMIN manual-trigger endpoint (/api/admin/cron-trigger/purge-anonymized)
// can run the SAME logic without touching the cron-lock.
//
// Cron schedule (vercel.json): "0 2 1 * *" — 02:00 UTC on the 1st of every
// month. If you see "Never run" on the dashboard, the most likely causes
// are: (a) the project hasn't been redeployed since the cron was added to
// vercel.json (Vercel re-syncs the schedule list on deploy), or (b) the
// Vercel plan disallows the monthly schedule. Use the manual trigger to
// rule out auth / lock / DB issues quickly.

import { defineCron } from '@/lib/cron-runner';
import { runPurgeAnonymized } from '@/lib/rgpd-purge';

export const GET = defineCron({
  name: 'purge-anonymized',
  period: 'monthly',
  fn: async () => {
    // PurgeResult is the rich typed shape returned by runPurgeAnonymized;
    // defineCron expects a generic Record<string, unknown>. The spread
    // widens it without losing any field — JSON.stringify on the wire
    // sees the same payload as before.
    const result = await runPurgeAnonymized();
    return { ...result };
  },
});
