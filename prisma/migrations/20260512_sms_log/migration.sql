-- SmsLog: persistent SMS deduplication table.
-- SHA-256(phone || '\x00' || message) as contentHash gives a stable key
-- that survives Redis restarts, redeployments, and BullMQ queue flushes.
-- Retention: rows older than 90 days are purged by the purge-anonymized cron.

CREATE TABLE IF NOT EXISTS "SmsLog" (
  "id"          TEXT          NOT NULL,
  "phone"       TEXT          NOT NULL,
  "contentHash" TEXT          NOT NULL,
  "sentAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status"      TEXT          NOT NULL DEFAULT 'SENT',
  "bookingId"   TEXT,
  CONSTRAINT "SmsLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SmsLog_phone_contentHash_key"
  ON "SmsLog"("phone", "contentHash");

CREATE INDEX IF NOT EXISTS "SmsLog_phone_sentAt_idx"
  ON "SmsLog"("phone", "sentAt");

CREATE INDEX IF NOT EXISTS "SmsLog_sentAt_idx"
  ON "SmsLog"("sentAt");

INSERT INTO "_app_migrations"(name)
VALUES ('20260512_sms_log')
ON CONFLICT DO NOTHING;
