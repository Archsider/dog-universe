# Uptime self-monitoring

## What it does

A 5-minute cron pings the app's own `/api/health/ping` endpoint, persists the
result in the `Heartbeat` table, and surfaces the data on a public
`/status` page.

```
Vercel cron (every 5 min)
    │
    ▼
/api/cron/heartbeat ──fetch──▶ /api/health/ping  (public, no auth)
    │
    ▼
INSERT into Heartbeat (30-day TTL)
    │
    ▼
/status (public Server Component) reads & renders
```

## Endpoints

### `GET /api/health/ping` (public)

Returns:
```json
{
  "status": "ok" | "degraded" | "down",
  "timestamp": "2026-05-13T08:00:00.000Z",
  "version": "1.0.0",
  "db": "ok" | "down",
  "redis": "ok" | "down",
  "dbLatencyMs": 42,
  "totalLatencyMs": 88
}
```

- **DB ok** : `SELECT 1` succeeds AND latency ≤ 500 ms.
- **Redis ok** : write+read round-trip succeeds (via `checkRedisHealth()`).
- **status** : `down` if DB is down ; `degraded` if Redis is down (app survives) ;
  `ok` otherwise.

HTTP code mirrors the JSON status: 200 for ok/degraded, 503 for down.
No auth, no rate-limit — used by the internal cron AND any external uptime
monitor you point at it.

### `GET /api/cron/heartbeat` (cron, `*/5 * * * *`)

- Pings `/api/health/ping` (timeout 15 s, internal HTTPS via `NEXTAUTH_URL`).
- Inserts a `Heartbeat` row with `{ status, latencyMs, dbStatus, redisStatus }`.
- If the 3 most recent rows are all non-ok → SMS to **all** SUPERADMIN users
  with a phone number (deduped 1h via Redis flag `heartbeat:alerted`).
- Prunes rows older than 30 days at the end of each tick.

Auth: `Bearer ${CRON_SECRET}` (timing-safe compare). Vercel injects this
automatically for its own crons.

## Public status page — `/status`

Server Component, no auth, no locale prefix. Shows:

- **Current status banner** (vert / orange / rouge) with the timestamp of
  the last heartbeat and the count of consecutive failures, if any.
- **Uptime cards** : 24 h / 7 j / 30 j (% of `ok` heartbeats in window).
  Returns "N/A" if no data in window.
- **Latency chart 24h** : inline SVG (no external library), with a dashed
  red line at the 500 ms DB budget. Points colored by status.
- **Last 10 incidents** : table of non-ok heartbeats over 30 days.

## What this does NOT detect

If Vercel itself is down — or the cron platform — no heartbeat will run
and the table will simply have a gap. The status page will keep showing
the last known status, which can be misleading.

**Always pair this internal system with an external uptime monitor:**

- [Better Stack](https://betterstack.com/uptime) — 50 monitors free, 30 s
  granularity, status page included. Recommended for serious production.
- [UptimeRobot](https://uptimerobot.com/) — 50 monitors free, 5 min
  granularity. Cheaper but coarser.
- [Cronitor](https://cronitor.io/) — designed specifically to alert when
  a cron stops running (heartbeat absence detection). Best fit if you
  want "no heartbeat for 15 min → page someone".

Recommended setup: external monitor pings `/api/health/ping` every 1–5
minutes, with PagerDuty / Slack / SMS escalation. The internal heartbeat
is the historical record + in-app SMS escalation; external is the
failsafe for when the platform itself is down.

## Operations

| Task | Where |
|---|---|
| Verify last heartbeat | `SELECT * FROM "Heartbeat" ORDER BY timestamp DESC LIMIT 1;` |
| Force a ping | `curl -H "Authorization: Bearer $CRON_SECRET" $URL/api/cron/heartbeat` |
| Public dashboard | https://dog-universe.vercel.app/status |
| Alert dedup TTL | 1 h, key `heartbeat:alerted` in Upstash Redis |
| SMS alert recipients | All `User` rows with `role='SUPERADMIN'`, `deletedAt IS NULL`, non-null `phone` |

## Schema

```prisma
model Heartbeat {
  id           String   @id @default(cuid())
  timestamp    DateTime @default(now())
  status       String   // "ok" | "degraded" | "down"
  latencyMs    Int
  dbStatus     String
  redisStatus  String

  @@index([timestamp(sort: Desc)])
}
```

Migration: `prisma/migrations/20260513_heartbeat/migration.sql` (apply
manually on Supabase if the build runner doesn't pick it up).
