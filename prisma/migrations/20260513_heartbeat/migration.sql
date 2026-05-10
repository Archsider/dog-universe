-- Heartbeat self-monitoring: stores periodic ping results from
-- /api/cron/heartbeat. Used by the public /status page to compute uptime
-- percentages and surface incidents. Rows older than 30 days are pruned by
-- the same cron at the end of each tick.

CREATE TABLE IF NOT EXISTS "Heartbeat" (
    "id"          TEXT NOT NULL,
    "timestamp"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status"      TEXT NOT NULL,
    "latencyMs"   INTEGER NOT NULL,
    "dbStatus"    TEXT NOT NULL,
    "redisStatus" TEXT NOT NULL,

    CONSTRAINT "Heartbeat_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Heartbeat_timestamp_idx" ON "Heartbeat" ("timestamp" DESC);
