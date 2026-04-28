-- Seed default boarding capacity limits.
-- Idempotent: existing rows (with admin overrides) are preserved.
INSERT INTO "Setting" ("key", "value", "updatedAt")
VALUES
  ('capacity_dog', '20', NOW()),
  ('capacity_cat', '10', NOW())
ON CONFLICT ("key") DO NOTHING;
