-- Migration: 20260407_monthly_revenue_summary
-- Adds MonthlyRevenueSummary table for historical revenue data entry
-- (Pre-production data for Jan/Feb/Mar 2026 and beyond)

CREATE TABLE IF NOT EXISTS "MonthlyRevenueSummary" (
    "id"              TEXT NOT NULL,
    "year"            INTEGER NOT NULL,
    "month"           INTEGER NOT NULL,
    "boardingRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "groomingRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxiRevenue"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherRevenue"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes"           TEXT,
    "createdBy"       TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyRevenueSummary_pkey" PRIMARY KEY ("id")
);

-- One record per year+month (no duplicate months)
CREATE UNIQUE INDEX IF NOT EXISTS "MonthlyRevenueSummary_year_month_key" ON "MonthlyRevenueSummary"("year", "month");

-- Index for year-based queries (fiscal year)
CREATE INDEX IF NOT EXISTS "MonthlyRevenueSummary_year_idx" ON "MonthlyRevenueSummary"("year");

-- FK to User (the admin who entered the data)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'MonthlyRevenueSummary_createdBy_fkey'
  ) THEN
    ALTER TABLE "MonthlyRevenueSummary"
        ADD CONSTRAINT "MonthlyRevenueSummary_createdBy_fkey"
        FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;
