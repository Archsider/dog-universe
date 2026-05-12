-- Composite index on User(role, isWalkIn)
-- Hot path: admin pages always filter WHERE role = 'CLIENT' AND "isWalkIn" = false
-- Avoids full table scan on the User table for every admin dashboard/clients/billing page
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_role_isWalkIn_idx" ON "User" ("role", "isWalkIn");
