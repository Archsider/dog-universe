# Cron recovery — runbook

> When a cron shows up as "JAMAIS" / "Never run" on `/admin/health`, or
> the cron-freshness watchdog has SMS-alerted a SUPERADMIN about a stale
> cron, follow this runbook.

## How crons work on this project

- **Source of truth**: `vercel.json` → top-level `crons[]` array.
- **Scheduling layer**: Vercel's scheduler (re-synced on EACH production
  deploy that touches `vercel.json`, or on every deploy depending on
  plan).
- **Auth**: each cron route uses `defineCron({ name, period, fn })` which
  checks the `x-cron-secret` header (`CRON_SECRET` env var on Vercel).
  Vercel injects this automatically via `Authorization: Bearer` for its
  own scheduled hits.
- **Telemetry**: every successful run calls `markCronRun(name)` which
  stamps `cron:last_run:<name>` in Upstash Redis (90j TTL).
- **Dashboard**: `/admin/health` reads `cron:last_run:<name>` for each
  cron in `CRON_NAMES` (`src/lib/observability.ts`). Shows "JAMAIS" when
  the key is missing.
- **Watchdog**: the heartbeat cron (`/api/cron/heartbeat`, every 5 min)
  runs `classifyCronFreshness` (`src/lib/cron-freshness.ts`). Once a cron
  has been observed `lastRun === null` for ≥ 48h, an SMS is fired to
  every SUPERADMIN (deduped 24h per cron).

## Symptom : a cron shows "JAMAIS" on `/admin/health`

### Step 1 — Confirm the cron is in `vercel.json`

```bash
grep -A1 "<cron-name>" vercel.json
```

If absent → add it back + redeploy. End of story.

### Step 2 — Trigger the cron manually to validate the CODE works

Every cron route has a SUPERADMIN-only manual trigger that bypasses the
cron-lock. Use it to prove the logic + auth + DB connectivity are fine,
without waiting for Vercel's scheduler.

For RGPD purge:
```bash
curl -X POST https://app.doguniverse.ma/api/admin/cron-trigger/purge-anonymized \
  -H "Cookie: <copy-from-browser-superadmin-session>"
```

For backups:
```bash
curl -X POST https://app.doguniverse.ma/api/admin/backups/trigger \
  -H "Cookie: <copy-from-browser-superadmin-session>"
```

If the manual trigger returns 200 with the expected payload → the code is
fine. The cron didn't fire because **Vercel didn't sync the schedule**.
Go to step 3.

If it returns 5xx → drill into Vercel runtime logs for that route. The
issue is in the code/DB/Redis chain, not the scheduler.

### Step 3 — Force Vercel to re-sync the crons

Vercel re-reads `vercel.json` crons on each production deploy. If the
last deploy didn't pick up your cron entry (race condition, build cache,
etc), force a re-sync:

**Option A — Empty commit**
```bash
git commit --allow-empty -m "chore(cron): nudge Vercel to re-sync crons"
git push origin main
```

**Option B — Redeploy button**
Vercel dashboard → Deployments → latest production → ⋯ menu → "Redeploy".
The "Use existing Build Cache" checkbox is fine to leave on — we just
want the cron list re-registered.

### Step 4 — Wait for the next scheduled tick

Watch `/admin/health` after the next scheduled time. The "JAMAIS" badge
should flip to a recent timestamp within 5 min of the scheduled cron
firing.

If it does NOT flip after the scheduled time + 30 min margin → drill
into Vercel cron logs (Vercel dashboard → Crons tab). If Vercel reports
the schedule fired but our route returned an error, runtime logs will
have the trace. If Vercel reports the schedule did NOT fire at all,
escalate to Vercel support.

## Symptom : SMS alert "cron(s) jamais exécuté(s) depuis ≥48h"

This means the **watchdog** caught a stale cron — it has observed
`lastRun === null` for at least 48h consecutively. Follow the
"JAMAIS on /admin/health" runbook above.

### One legitimate false positive: monthly crons

`purge-anonymized` schedules `0 2 1 * *` (1st of month at 02:00 UTC).
At the very first observation after adding it to `vercel.json`, the
watchdog will see `lastRun === null` and stamp the anchor. If 48h
elapse before the 1st of the month, an SMS will fire.

**Fix**: run the manual trigger once (`/api/admin/cron-trigger/<name>`)
to stamp `markCronRun()` and reset the watchdog state. This proves the
code works AND silences the watchdog until the next scheduled run.

## Symptom : `cron:last_run:<name>` exists but is stale

Means the cron USED to run, then stopped. The watchdog ONLY catches
"never ran" — it does NOT catch "ran then stopped" (would need per-cron
expected-period logic). Catch this manually on `/admin/health` by
comparing "last run" timestamp to the expected schedule.

If we ever want to alert on "ran then stopped", extend
`classifyCronFreshness` to know each cron's expected period and compute
"hours since lastRun" against a per-cron threshold. Not shipped today
because monthly cron (purge-anonymized) makes the per-cron threshold
non-trivial and the manual `/admin/health` review covers it.

## When to escalate

- Manual trigger returns 5xx → code/DB/Redis issue → fix the route
- Manual trigger returns 200, Vercel scheduler still doesn't fire after
  redeploy → Vercel support
- Watchdog SMS keeps firing every 24h despite manual trigger → check
  the manual trigger code calls `markCronRun(name)` after success.
  Without that call, `cron:last_run` stays unset, and the watchdog
  re-arms.

## File reference

- `src/lib/cron-freshness.ts` — classifier + Redis anchors
- `src/lib/observability.ts` — `CRON_NAMES`, `markCronRun`, `getCronLastRun`
- `src/app/api/cron/heartbeat/route.ts` — wires the watchdog into the
  5-min heartbeat
- `src/app/api/admin/cron-trigger/<name>/route.ts` — manual triggers
- `vercel.json` — schedule registry
