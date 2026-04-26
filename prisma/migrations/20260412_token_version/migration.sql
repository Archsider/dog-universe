-- Add tokenVersion to User for JWT invalidation on password change/reset
-- Run on Supabase: https://supabase.com/dashboard/project/YOUR_PROJECT/sql

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
