-- Web Push subscriptions — Wave 7.2
--
-- Each row = one browser/device subscribed to push notifications.  Keys
-- (p256dh + auth) generated client-side by PushManager.subscribe() ; the
-- server stores them to send notifications via the `web-push` lib.
--
-- Source : Wave 6 #7 deferred, landed 2026-05-20.

CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  "endpoint"  TEXT NOT NULL,
  "p256dh"    TEXT NOT NULL,
  "auth"      TEXT NOT NULL,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "lastUsed"  TIMESTAMP(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "PushSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
  CONSTRAINT "PushSubscription_userId_endpoint_key" UNIQUE ("userId", "endpoint")
);

CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription" ("userId");
