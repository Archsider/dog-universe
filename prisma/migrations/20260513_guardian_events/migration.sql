-- AI Guardian: persistance des évènements Sentry classifiés par Claude.
-- Voir src/lib/guardian/* et docs/GUARDIAN.md.

CREATE TABLE IF NOT EXISTS "GuardianEvent" (
  "id"              TEXT PRIMARY KEY,
  "sentryEventId"   TEXT NOT NULL,
  "sentryIssueId"   TEXT,
  "projectSlug"     TEXT,
  "title"           TEXT NOT NULL,
  "culprit"         TEXT,
  "level"           TEXT,
  "classification"  TEXT NOT NULL,
  "severity"        INTEGER NOT NULL,
  "action"          TEXT NOT NULL,
  "reason"          TEXT,
  "githubIssueUrl"  TEXT,
  "occurrencesSeen" INTEGER NOT NULL DEFAULT 1,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "GuardianEvent_sentryEventId_key" ON "GuardianEvent" ("sentryEventId");
CREATE INDEX IF NOT EXISTS "GuardianEvent_createdAt_idx" ON "GuardianEvent" ("createdAt");
CREATE INDEX IF NOT EXISTS "GuardianEvent_classification_idx" ON "GuardianEvent" ("classification");
